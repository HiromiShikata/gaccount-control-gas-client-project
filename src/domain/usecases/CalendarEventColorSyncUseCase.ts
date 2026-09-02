import { CalendarRef } from '../entities/CalendarRef';
import { SyncConfiguration } from '../entities/SyncConfiguration';
import { CalendarPort } from './adapter-interfaces/CalendarPort';
import { ConfigPort } from './adapter-interfaces/ConfigPort';
import { LogPort } from './adapter-interfaces/LogPort';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export class CalendarEventColorSyncUseCase {
  constructor(
    readonly calendarPort: CalendarPort,
    readonly configPort: ConfigPort,
    readonly logPort: LogPort,
  ) {}

  execute(now: Date): void {
    let syncDays: number;
    try {
      syncDays = SyncConfiguration.parseSyncDays(
        this.configPort.getRequired('SYNC_DAYS'),
      );
    } catch (error) {
      this.logPort.error(
        `Event color sync configuration is invalid, skipping run: ${this.describe(error)}`,
      );
      return;
    }

    const own: CalendarRef = { type: 'own' };
    const from = now;
    const to = new Date(now.getTime() + syncDays * MILLISECONDS_PER_DAY);

    const ownEvents = this.calendarPort.listTimedEvents(own, from, to);

    for (const event of ownEvents) {
      if (event.title.startsWith('Moving')) {
        this.calendarPort.setEventColor(own, event.id, 'flamingo');
      }
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
