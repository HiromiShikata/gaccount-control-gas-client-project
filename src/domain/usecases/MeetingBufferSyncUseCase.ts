import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholderReconciliation } from '../entities/HoldPlaceholderReconciliation';
import { MeetingBufferReconciliation } from '../entities/MeetingBufferReconciliation';
import { SyncConfiguration } from '../entities/SyncConfiguration';
import { CalendarPort } from './adapter-interfaces/CalendarPort';
import { ConfigPort } from './adapter-interfaces/ConfigPort';
import { LogPort } from './adapter-interfaces/LogPort';
import {
  MeetingBufferStatePort,
  ProcessedEventSnapshot,
} from './adapter-interfaces/MeetingBufferStatePort';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export class MeetingBufferSyncUseCase {
  constructor(
    readonly calendarPort: CalendarPort,
    readonly configPort: ConfigPort,
    readonly logPort: LogPort,
    readonly statePort: MeetingBufferStatePort,
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

    for (const event of MeetingBufferReconciliation.selectLegacyBuffers(
      ownEvents,
    )) {
      this.calendarPort.deleteEvent(own, event.id);
    }

    const processedSnapshots = this.statePort.getProcessedEventSnapshots();

    const qualifyingOwnEvents =
      MeetingBufferReconciliation.selectQualifyingSourceEvents(ownEvents);

    const unprocessedOwnEvents = qualifyingOwnEvents.filter(
      (event) => !this.isAlreadyProcessed(event, processedSnapshots),
    );

    const allDesired =
      MeetingBufferReconciliation.computeDesiredBuffers(ownEvents);
    const existing =
      MeetingBufferReconciliation.selectExistingBuffers(hubEvents);

    const { toDelete } = HoldPlaceholderReconciliation.reconcile(
      allDesired,
      existing,
    );

    for (const event of toDelete) {
      this.calendarPort.deleteEvent(hub, event.id);
    }

    for (const event of MeetingBufferReconciliation.selectLegacyBuffers(
      hubEvents,
    )) {
      this.calendarPort.deleteEvent(hub, event.id);
    }

    const newDesired =
      MeetingBufferReconciliation.computeDesiredBuffers(unprocessedOwnEvents);
    const existingKeys = new Set(existing.map((e) => e.dedupKey()));
    const toCreate = newDesired.filter((p) => !existingKeys.has(p.dedupKey()));

    for (const buffer of toCreate) {
      this.calendarPort.createHoldPlaceholder(hub, buffer);
    }

    const updatedSnapshots = new Map<string, ProcessedEventSnapshot>();
    for (const event of qualifyingOwnEvents) {
      updatedSnapshots.set(event.id, {
        startMs: event.startAt.getTime(),
        endMs: event.endAt.getTime(),
      });
    }
    this.statePort.setProcessedEventSnapshots(updatedSnapshots);
  }

  private isAlreadyProcessed(
    event: CalendarEvent,
    snapshots: Map<string, ProcessedEventSnapshot>,
  ): boolean {
    const snapshot = snapshots.get(event.id);
    if (!snapshot) return false;
    return (
      snapshot.startMs === event.startAt.getTime() &&
      snapshot.endMs === event.endAt.getTime()
    );
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
