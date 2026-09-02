import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholderReconciliation } from '../entities/HoldPlaceholderReconciliation';
import { MeetingBufferReconciliation } from '../entities/MeetingBufferReconciliation';
import { SyncConfiguration } from '../entities/SyncConfiguration';
import { CalendarPort } from './adapter-interfaces/CalendarPort';
import { ConfigPort } from './adapter-interfaces/ConfigPort';
import { LogPort } from './adapter-interfaces/LogPort';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export class MeetingBufferSyncUseCase {
  constructor(
    readonly calendarPort: CalendarPort,
    readonly configPort: ConfigPort,
    readonly logPort: LogPort,
  ) {}

  execute(now: Date): void {
    let hubCalendarId: string;
    let syncDays: number;
    try {
      hubCalendarId = this.configPort.getRequired('HUB_CALENDAR_ID');
      syncDays = SyncConfiguration.parseSyncDays(
        this.configPort.getRequired('SYNC_DAYS'),
      );
    } catch (error) {
      this.logPort.error(
        `Meeting buffer configuration is invalid, skipping run: ${this.describe(error)}`,
      );
      return;
    }

    const own: CalendarRef = { type: 'own' };
    const hub: CalendarRef = { type: 'hub', hubCalendarId };
    const from = now;
    const to = new Date(now.getTime() + syncDays * MILLISECONDS_PER_DAY);

    const ownEvents = this.calendarPort.listTimedEvents(own, from, to);
    const hubEvents = this.calendarPort.listTimedEvents(hub, from, to);

    for (const event of MeetingBufferReconciliation.selectExistingBuffers(
      ownEvents,
    )) {
      this.calendarPort.deleteEvent(own, event.id);
    }

    const desired =
      MeetingBufferReconciliation.computeDesiredBuffers(ownEvents);
    const existing =
      MeetingBufferReconciliation.selectExistingBuffers(hubEvents);
    const { toCreate, toDelete } = HoldPlaceholderReconciliation.reconcile(
      desired,
      existing,
    );

    for (const event of toDelete) {
      this.calendarPort.deleteEvent(hub, event.id);
    }
    for (const buffer of toCreate) {
      this.calendarPort.createHoldPlaceholder(hub, buffer);
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
