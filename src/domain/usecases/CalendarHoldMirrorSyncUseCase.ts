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

export const MAX_REMINDER_REPAIRS_PER_RUN = 50;

export class CalendarHoldMirrorSyncUseCase {
  constructor(
    readonly calendarPort: CalendarPort,
    readonly configPort: ConfigPort,
    readonly logPort: LogPort,
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
    this.pushToHub(hub, ownEvents, hubEvents, ownDomain, failures);
    this.pullFromHub(
      own,
      ownEvents,
      hubEvents,
      ownDomain,
      configuration,
      failures,
    );
    failures.throwIfAny();
  }

  private pushToHub(
    hub: CalendarRef,
    ownEvents: CalendarEvent[],
    hubEvents: CalendarEvent[],
    ownDomain: string,
    failures: CalendarSyncFailureCollector,
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
    const deleted = [...toDelete, ...duplicates];
    for (const placeholder of deleted) {
      failures.attempt(
        `delete hub placeholder event ${placeholder.id}${this.describeWindow(placeholder)}`,
        () => this.calendarPort.deleteEvent(hub, placeholder.id),
      );
    }
    for (const placeholder of toCreate) {
      failures.attempt(
        `create hub placeholder "${placeholder.title}"${this.describeWindow(placeholder)}`,
        () => this.calendarPort.createHoldPlaceholder(hub, placeholder),
      );
    }
    this.repairReminders(hub, 'hub', kept, toDelete, failures);
  }

  private pullFromHub(
    own: CalendarRef,
    ownEvents: CalendarEvent[],
    hubEvents: CalendarEvent[],
    ownDomain: string,
    configuration: SyncConfiguration,
    failures: CalendarSyncFailureCollector,
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
    for (const placeholder of toDelete) {
      failures.attempt(
        `delete own placeholder event ${placeholder.id}${this.describeWindow(placeholder)}`,
        () => this.calendarPort.deleteEvent(own, placeholder.id),
      );
    }
    for (const placeholder of toCreate) {
      failures.attempt(
        `create own placeholder "${placeholder.title}"${this.describeWindow(placeholder)}`,
        () => this.calendarPort.createHoldPlaceholder(own, placeholder),
      );
    }
    this.repairReminders(own, 'own', existing, toDelete, failures);
  }

  private repairReminders(
    calendar: CalendarRef,
    calendarLabel: string,
    existing: ExistingHoldPlaceholder[],
    deleted: ExistingHoldPlaceholder[],
    failures: CalendarSyncFailureCollector,
  ): void {
    for (const placeholder of existing) {
      if (placeholder.hasRemindersRemoved || deleted.includes(placeholder)) {
        continue;
      }
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
