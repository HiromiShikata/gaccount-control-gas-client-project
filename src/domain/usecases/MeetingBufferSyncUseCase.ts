import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholderReconciliation } from '../entities/HoldPlaceholderReconciliation';
import { MeetingBufferReconciliation } from '../entities/MeetingBufferReconciliation';
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
    let syncDays: number;
    try {
      syncDays = this.loadSyncDays();
    } catch (error) {
      this.logPort.error(
        `Meeting buffer configuration is invalid, skipping run: ${this.describe(error)}`,
      );
      return;
    }

    const own: CalendarRef = { type: 'own' };
    const from = now;
    const to = new Date(now.getTime() + syncDays * MILLISECONDS_PER_DAY);
    const ownEvents = this.calendarPort.listTimedEvents(own, from, to);

    const desired =
      MeetingBufferReconciliation.computeDesiredBuffers(ownEvents);
    const existing =
      MeetingBufferReconciliation.selectExistingBuffers(ownEvents);
    const { toCreate, toDelete } = HoldPlaceholderReconciliation.reconcile(
      desired,
      existing,
    );

    for (const event of toDelete) {
      this.calendarPort.deleteEvent(own, event.id);
    }
    for (const buffer of toCreate) {
      this.calendarPort.createHoldPlaceholder(own, buffer);
    }
  }

  private loadSyncDays(): number {
    const syncDaysRaw = this.configPort.getRequired('SYNC_DAYS');
    const syncDays = Number.parseInt(syncDaysRaw, 10);
    if (!Number.isInteger(syncDays) || syncDays <= 0) {
      throw new Error(
        `SYNC_DAYS must be a positive integer, received "${syncDaysRaw}"`,
      );
    }
    return syncDays;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
