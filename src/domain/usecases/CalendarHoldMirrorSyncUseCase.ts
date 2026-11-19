import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarRef } from '../entities/CalendarRef';
import { ExistingHoldPlaceholder } from '../entities/ExistingHoldPlaceholder';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import { HoldPlaceholderReconciliation } from '../entities/HoldPlaceholderReconciliation';
import { SyncConfiguration } from '../entities/SyncConfiguration';
import { CalendarPort } from './adapter-interfaces/CalendarPort';
import { ConfigPort } from './adapter-interfaces/ConfigPort';
import { HoldPlaceholderPort } from './adapter-interfaces/HoldPlaceholderPort';
import { LogPort } from './adapter-interfaces/LogPort';
import { CalendarSyncFailureCollector } from './CalendarSyncFailureCollector';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

interface PlaceholderSide {
  readonly calendar: CalendarRef;
  readonly calendarLabel: 'own' | 'hub';
}

export class CalendarHoldMirrorSyncUseCase {
  constructor(
    readonly calendarPort: CalendarPort,
    readonly holdPlaceholderPort: HoldPlaceholderPort,
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
    let invalidOwnIds: ReadonlySet<string> = new Set<string>();
    failures.attempt('list own invalid reminders', () => {
      invalidOwnIds = new Set(
        this.holdPlaceholderPort.listICalUidsWithInvalidReminders(
          own,
          from,
          to,
        ),
      );
    });
    let invalidHubIds: ReadonlySet<string> = new Set<string>();
    failures.attempt('list hub invalid reminders', () => {
      invalidHubIds = new Set(
        this.holdPlaceholderPort.listICalUidsWithInvalidReminders(
          hub,
          from,
          to,
        ),
      );
    });
    this.pushToHub(
      hub,
      ownEvents,
      hubEvents,
      ownDomain,
      invalidHubIds,
      failures,
    );
    this.pullFromHub(
      own,
      ownEvents,
      hubEvents,
      ownDomain,
      configuration,
      invalidOwnIds,
      failures,
    );
    failures.throwIfAny();
  }

  private pushToHub(
    hub: CalendarRef,
    ownEvents: CalendarEvent[],
    hubEvents: CalendarEvent[],
    ownDomain: string,
    invalidIds: ReadonlySet<string>,
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
    this.reconcilePlaceholders(
      { calendar: hub, calendarLabel: 'hub' },
      desired,
      kept,
      duplicates,
      invalidIds,
      failures,
    );
  }

  private pullFromHub(
    own: CalendarRef,
    ownEvents: CalendarEvent[],
    hubEvents: CalendarEvent[],
    ownDomain: string,
    configuration: SyncConfiguration,
    invalidIds: ReadonlySet<string>,
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
    this.reconcilePlaceholders(
      { calendar: own, calendarLabel: 'own' },
      desired,
      existing,
      [],
      invalidIds,
      failures,
    );
  }

  private reconcilePlaceholders(
    side: PlaceholderSide,
    desired: HoldPlaceholder[],
    kept: ExistingHoldPlaceholder[],
    duplicates: ExistingHoldPlaceholder[],
    invalidIds: ReadonlySet<string>,
    failures: CalendarSyncFailureCollector,
  ): void {
    const { toCreate, toDelete } = HoldPlaceholderReconciliation.reconcile(
      desired,
      kept,
    );
    for (const placeholder of toDelete) {
      this.deletePlaceholder(side, placeholder, failures);
    }
    const failedDuplicateKeys = new Set<string>();
    for (const placeholder of duplicates) {
      if (!this.deletePlaceholder(side, placeholder, failures)) {
        failedDuplicateKeys.add(placeholder.dedupKey());
      }
    }
    for (const placeholder of toCreate) {
      this.createPlaceholder(
        side.calendar,
        `create ${side.calendarLabel} placeholder "${placeholder.title}"${this.describeWindow(placeholder)}`,
        placeholder,
        failures,
      );
    }
    const deletingIds = new Set(toDelete.map((placeholder) => placeholder.id));
    for (const placeholder of kept) {
      if (
        deletingIds.has(placeholder.id) ||
        !invalidIds.has(placeholder.id) ||
        failedDuplicateKeys.has(placeholder.dedupKey())
      ) {
        continue;
      }
      if (this.deletePlaceholder(side, placeholder, failures)) {
        this.createPlaceholder(
          side.calendar,
          `recreate ${side.calendarLabel} placeholder "${placeholder.title}"${this.describeWindow(placeholder)}`,
          new HoldPlaceholder(
            placeholder.title,
            placeholder.startAt,
            placeholder.endAt,
          ),
          failures,
        );
      }
    }
  }

  private deletePlaceholder(
    side: PlaceholderSide,
    placeholder: ExistingHoldPlaceholder,
    failures: CalendarSyncFailureCollector,
  ): boolean {
    return failures.attempt(
      `delete ${side.calendarLabel} placeholder event ${placeholder.id}${this.describeWindow(placeholder)}`,
      () => this.calendarPort.deleteEvent(side.calendar, placeholder.id),
    );
  }

  private createPlaceholder(
    calendar: CalendarRef,
    label: string,
    placeholder: HoldPlaceholder,
    failures: CalendarSyncFailureCollector,
  ): void {
    failures.attempt(label, () =>
      this.holdPlaceholderPort.createHoldPlaceholder(calendar, placeholder),
    );
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
