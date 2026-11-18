import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarRef } from '../entities/CalendarRef';
import { ExistingHoldPlaceholder } from '../entities/ExistingHoldPlaceholder';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import { HoldPlaceholderReconciliation } from '../entities/HoldPlaceholderReconciliation';
import { SyncConfiguration } from '../entities/SyncConfiguration';
import { CalendarPort } from './adapter-interfaces/CalendarPort';
import { ConfigPort } from './adapter-interfaces/ConfigPort';
import { LogPort } from './adapter-interfaces/LogPort';
import { CalendarSyncFailureCollector } from './CalendarSyncFailureCollector';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Upper bound on reminder removals per run. Each removal is two calendar
 * writes, and a run already takes up to about 1215 s against a 1800 s Apps
 * Script limit, so a first run after deploy must not add an unbounded number
 * of writes. Earliest-starting placeholders go first; the rest wait for later
 * runs, which see them still unmarked.
 */
export const MAX_REMINDER_REPAIRS_PER_RUN = 50;

interface ReminderRepair {
  readonly calendar: CalendarRef;
  readonly calendarLabel: string;
  readonly placeholder: ExistingHoldPlaceholder;
}

export class CalendarHoldMirrorSyncUseCase {
  constructor(
    readonly calendarPort: CalendarPort,
    readonly configPort: ConfigPort,
    readonly logPort: LogPort,
    readonly maxReminderRepairsPerRun: number = MAX_REMINDER_REPAIRS_PER_RUN,
  ) {}

  execute(now: Date, ownDomain: string): void {
    let configuration: SyncConfiguration;
    try {
      configuration = this.loadConfiguration();
    } catch (error) {
      this.logPort.error(
        `Configuration is invalid, skipping run: ${this.describe(error)}`,
      );
      return;
    }

    const hub: CalendarRef = {
      type: 'hub',
      hubCalendarId: configuration.hubCalendarId,
    };
    if (!this.calendarPort.exists(hub)) {
      this.logPort.error(
        `Hub calendar is not accessible, skipping run: ${configuration.hubCalendarId}`,
      );
      return;
    }

    const own: CalendarRef = { type: 'own' };
    const from = now;
    const to = new Date(
      now.getTime() + configuration.syncDays * MILLISECONDS_PER_DAY,
    );
    const ownEvents = this.calendarPort.listTimedEvents(own, from, to);
    const hubEvents = this.calendarPort.listTimedEvents(hub, from, to);
    const failures = new CalendarSyncFailureCollector();
    const repairs: ReminderRepair[] = [];
    this.pushToHub(hub, ownEvents, hubEvents, ownDomain, failures, repairs);
    this.pullFromHub(
      own,
      ownEvents,
      hubEvents,
      ownDomain,
      configuration,
      failures,
      repairs,
    );
    this.repairReminders(repairs, failures);
    failures.throwIfAny();
  }

  private pushToHub(
    hub: CalendarRef,
    ownEvents: CalendarEvent[],
    hubEvents: CalendarEvent[],
    ownDomain: string,
    failures: CalendarSyncFailureCollector,
    repairs: ReminderRepair[],
  ): void {
    const desired =
      HoldPlaceholderReconciliation.computePushDesiredPlaceholders(
        ownEvents,
        hubEvents,
        ownDomain,
      );
    const existingAll =
      HoldPlaceholderReconciliation.selectPushExistingPlaceholders(
        hubEvents,
        ownDomain,
      );
    const { kept, duplicates } =
      HoldPlaceholderReconciliation.separateDuplicateExistingPlaceholders(
        existingAll,
      );
    const { toCreate, toDelete } = HoldPlaceholderReconciliation.reconcile(
      desired,
      kept,
    );
    const deletedIds = new Set<string>();
    for (const placeholder of [...toDelete, ...duplicates]) {
      const deleted = failures.attempt(
        `delete hub placeholder event ${placeholder.id}${this.describeWindow(placeholder)}`,
        () => this.calendarPort.deleteEvent(hub, placeholder.id),
      );
      if (deleted) {
        deletedIds.add(placeholder.id);
      }
    }
    for (const placeholder of toCreate) {
      failures.attempt(
        `create hub placeholder "${placeholder.title}"${this.describeWindow(placeholder)}`,
        () => this.calendarPort.createHoldPlaceholder(hub, placeholder),
      );
    }
    this.collectRepairs(
      hub,
      'hub',
      [...kept, ...duplicates],
      deletedIds,
      repairs,
    );
  }

  private pullFromHub(
    own: CalendarRef,
    ownEvents: CalendarEvent[],
    hubEvents: CalendarEvent[],
    ownDomain: string,
    configuration: SyncConfiguration,
    failures: CalendarSyncFailureCollector,
    repairs: ReminderRepair[],
  ): void {
    const desired =
      HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
        hubEvents,
        ownDomain,
        configuration.meetingOkTag,
        configuration.meetingOkTitle,
      );
    const existing =
      HoldPlaceholderReconciliation.selectPullExistingPlaceholders(ownEvents);
    const { toCreate, toDelete } = HoldPlaceholderReconciliation.reconcile(
      desired,
      existing,
    );
    const deletedIds = new Set<string>();
    for (const placeholder of toDelete) {
      const deleted = failures.attempt(
        `delete own placeholder event ${placeholder.id}${this.describeWindow(placeholder)}`,
        () => this.calendarPort.deleteEvent(own, placeholder.id),
      );
      if (deleted) {
        deletedIds.add(placeholder.id);
      }
    }
    for (const placeholder of toCreate) {
      failures.attempt(
        `create own placeholder "${placeholder.title}"${this.describeWindow(placeholder)}`,
        () => this.calendarPort.createHoldPlaceholder(own, placeholder),
      );
    }
    this.collectRepairs(own, 'own', existing, deletedIds, repairs);
  }

  private collectRepairs(
    calendar: CalendarRef,
    calendarLabel: string,
    existing: ExistingHoldPlaceholder[],
    deletedIds: Set<string>,
    repairs: ReminderRepair[],
  ): void {
    for (const placeholder of existing) {
      if (deletedIds.has(placeholder.id)) {
        continue;
      }
      repairs.push({ calendar, calendarLabel, placeholder });
    }
  }

  private repairReminders(
    repairs: ReminderRepair[],
    failures: CalendarSyncFailureCollector,
  ): void {
    const candidates = repairs
      .filter((repair) => !repair.placeholder.hasRemindersRemoved)
      .sort(
        (left, right) =>
          left.placeholder.startAt.getTime() -
          right.placeholder.startAt.getTime(),
      )
      .slice(0, this.maxReminderRepairsPerRun);
    for (const { calendar, calendarLabel, placeholder } of candidates) {
      failures.attempt(
        `remove reminders from ${calendarLabel} placeholder event ${placeholder.id}${this.describeWindow(placeholder)}`,
        () =>
          this.calendarPort.removeHoldPlaceholderReminders(
            calendar,
            placeholder.id,
          ),
      );
    }
  }

  private describeWindow(
    placeholder: HoldPlaceholder | ExistingHoldPlaceholder,
  ): string {
    return ` from ${placeholder.startAt.toISOString()} to ${placeholder.endAt.toISOString()}`;
  }

  private loadConfiguration(): SyncConfiguration {
    return SyncConfiguration.create(
      this.configPort.getRequired('HUB_CALENDAR_ID'),
      this.configPort.getRequired('SYNC_DAYS'),
      this.configPort.getRequired('MEETING_OK_TAG'),
      this.configPort.getRequired('MEETING_OK_TITLE'),
    );
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
