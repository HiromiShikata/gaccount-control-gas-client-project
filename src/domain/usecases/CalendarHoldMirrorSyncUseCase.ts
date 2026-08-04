import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholderReconciliation } from '../entities/HoldPlaceholderReconciliation';
import { SyncConfiguration } from '../entities/SyncConfiguration';
import { CalendarPort } from './adapter-interfaces/CalendarPort';
import { ConfigPort } from './adapter-interfaces/ConfigPort';
import { LogPort } from './adapter-interfaces/LogPort';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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
    this.pushToHub(own, hub, ownDomain, from, to);
    this.pullFromHub(own, hub, ownDomain, from, to, configuration);
  }

  private pushToHub(
    own: CalendarRef,
    hub: CalendarRef,
    ownDomain: string,
    from: Date,
    to: Date,
  ): void {
    const ownEvents = this.calendarPort.listTimedEvents(own, from, to);
    const desired =
      HoldPlaceholderReconciliation.computePushDesiredPlaceholders(
        ownEvents,
        ownDomain,
      );
    const hubEvents = this.calendarPort.listTimedEvents(hub, from, to);
    const existing =
      HoldPlaceholderReconciliation.selectPushExistingPlaceholders(
        hubEvents,
        ownDomain,
      );
    const { toCreate, toDelete } = HoldPlaceholderReconciliation.reconcile(
      desired,
      existing,
    );
    for (const placeholder of toDelete) {
      this.calendarPort.deleteEvent(hub, placeholder.id);
    }
    for (const placeholder of toCreate) {
      this.calendarPort.createHoldPlaceholder(hub, placeholder);
    }
  }

  private pullFromHub(
    own: CalendarRef,
    hub: CalendarRef,
    ownDomain: string,
    from: Date,
    to: Date,
    configuration: SyncConfiguration,
  ): void {
    const hubEvents = this.calendarPort.listTimedEvents(hub, from, to);
    const desired =
      HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
        hubEvents,
        ownDomain,
        configuration.meetingOkTag,
        configuration.meetingOkTitle,
      );
    const ownEvents = this.calendarPort.listTimedEvents(own, from, to);
    const existing =
      HoldPlaceholderReconciliation.selectPullExistingPlaceholders(ownEvents);
    const { toCreate, toDelete } = HoldPlaceholderReconciliation.reconcile(
      desired,
      existing,
    );
    for (const placeholder of toDelete) {
      this.calendarPort.deleteEvent(own, placeholder.id);
    }
    for (const placeholder of toCreate) {
      this.calendarPort.createHoldPlaceholder(own, placeholder);
    }
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
