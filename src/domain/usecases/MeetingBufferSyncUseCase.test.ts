import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import {
  LEGACY_PREP_TAG,
  LEGACY_SUMMARY_TAG,
} from '../entities/CalendarEventTags';
import { PREP_TAG, SUMMARY_TAG } from '../entities/MeetingBufferReconciliation';
import { ProcessedEventSnapshot } from './adapter-interfaces/MeetingBufferStatePort';
import { MeetingBufferSyncUseCase } from './MeetingBufferSyncUseCase';

const NOW = new Date('2020-01-01T00:00:00Z');
const SYNC_DAYS = 90;
const HUB_CALENDAR_ID = 'hub-calendar-id';
const CONFIG: Record<string, string> = {
  SYNC_DAYS: String(SYNC_DAYS),
  HUB_CALENDAR_ID,
};
const BUFFER_MS = 15 * 60 * 1000;

const hub: CalendarRef = { type: 'hub', hubCalendarId: HUB_CALENDAR_ID };

const createMocks = (
  eventsByCalendar: { own: CalendarEvent[]; hub: CalendarEvent[] },
  config: Record<string, string> = CONFIG,
  initialSnapshots: Map<string, ProcessedEventSnapshot> = new Map(),
) => {
  const own: CalendarRef = { type: 'own' };
  const calendarPort = {
    exists: jest.fn((): boolean => true),
    listTimedEvents: jest.fn(
      (calendar: CalendarRef, _from: Date, _to: Date): CalendarEvent[] =>
        calendar.type === 'hub' ? eventsByCalendar.hub : eventsByCalendar.own,
    ),
    createHoldPlaceholder: jest.fn(
      (_calendar: CalendarRef, _placeholder: HoldPlaceholder): void => {},
    ),
    deleteEvent: jest.fn(
      (_calendar: CalendarRef, _eventId: string): void => {},
    ),
  };
  const configPort = {
    getRequired: jest.fn((key: string): string => {
      const value = config[key];
      if (value === undefined) {
        throw new Error(`Required Script Property "${key}" is not set`);
      }
      return value;
    }),
  };
  const logPort = {
    error: jest.fn((_message: string): void => {}),
  };
  const statePort = {
    getProcessedEventSnapshots: jest.fn(
      (): Map<string, ProcessedEventSnapshot> => initialSnapshots,
    ),
    setProcessedEventSnapshots: jest.fn(
      (_snapshots: Map<string, ProcessedEventSnapshot>): void => {},
    ),
  };
  const useCase = new MeetingBufferSyncUseCase(
    calendarPort,
    configPort,
    logPort,
    statePort,
  );
  return { useCase, calendarPort, configPort, logPort, statePort, own };
};

describe('MeetingBufferSyncUseCase', () => {
  describe('execute', () => {
    it('creates prep and summary buffers on the hub calendar for new own timed events', () => {
      const meetingStart = new Date('2020-01-02T09:00:00Z');
      const meetingEnd = new Date('2020-01-02T09:30:00Z');
      const { useCase, calendarPort } = createMocks({
        own: [
          new CalendarEvent(
            'meeting-1',
            'Standup',
            meetingStart,
            meetingEnd,
            false,
            false,
          ),
        ],
        hub: [],
      });

      useCase.execute(NOW);

      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([
        [
          hub,
          new HoldPlaceholder(
            `${PREP_TAG} Standup`,
            new Date(meetingStart.getTime() - BUFFER_MS),
            meetingStart,
          ),
        ],
        [
          hub,
          new HoldPlaceholder(
            `${SUMMARY_TAG} Standup`,
            meetingEnd,
            new Date(meetingEnd.getTime() + BUFFER_MS),
          ),
        ],
      ]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    });

    it('creates hub calendar summary buffer events with [SUMMARY] square-bracket prefix', () => {
      const meetingStart = new Date('2020-01-02T09:00:00Z');
      const meetingEnd = new Date('2020-01-02T09:30:00Z');
      const { useCase, calendarPort } = createMocks({
        own: [
          new CalendarEvent(
            'meeting-1',
            'Standup',
            meetingStart,
            meetingEnd,
            false,
            false,
          ),
        ],
        hub: [],
      });

      useCase.execute(NOW);

      const createdTitles = calendarPort.createHoldPlaceholder.mock.calls.map(
        ([, ph]: [unknown, HoldPlaceholder]) => ph.title,
      );
      expect(createdTitles).toContain('[SUMMARY] Standup');
    });

    it('does not recreate buffers manually deleted from the hub for an already-processed event', () => {
      const meetingStart = new Date('2020-01-02T09:00:00Z');
      const meetingEnd = new Date('2020-01-02T09:30:00Z');
      const processedSnapshot = new Map([
        [
          'meeting-1',
          {
            startMs: meetingStart.getTime(),
            endMs: meetingEnd.getTime(),
            title: 'Standup',
          },
        ],
      ]);
      const { useCase, calendarPort } = createMocks(
        {
          own: [
            new CalendarEvent(
              'meeting-1',
              'Standup',
              meetingStart,
              meetingEnd,
              false,
              false,
            ),
          ],
          hub: [],
        },
        CONFIG,
        processedSnapshot,
      );

      useCase.execute(NOW);

      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    });

    it('recreates buffers when the same event is rescheduled to a different time', () => {
      const oldStart = new Date('2020-01-02T09:00:00Z');
      const oldEnd = new Date('2020-01-02T09:30:00Z');
      const newStart = new Date('2020-01-02T10:00:00Z');
      const newEnd = new Date('2020-01-02T10:30:00Z');
      const processedSnapshot = new Map([
        [
          'meeting-1',
          {
            startMs: oldStart.getTime(),
            endMs: oldEnd.getTime(),
            title: 'Standup',
          },
        ],
      ]);
      const { useCase, calendarPort } = createMocks(
        {
          own: [
            new CalendarEvent(
              'meeting-1',
              'Standup',
              newStart,
              newEnd,
              false,
              false,
            ),
          ],
          hub: [
            new CalendarEvent(
              'prep-old',
              `${PREP_TAG} Standup`,
              new Date(oldStart.getTime() - BUFFER_MS),
              oldStart,
              false,
              false,
            ),
            new CalendarEvent(
              'summary-old',
              `${SUMMARY_TAG} Standup`,
              oldEnd,
              new Date(oldEnd.getTime() + BUFFER_MS),
              false,
              false,
            ),
          ],
        },
        CONFIG,
        processedSnapshot,
      );

      useCase.execute(NOW);

      expect(calendarPort.deleteEvent.mock.calls).toEqual([
        [hub, 'prep-old'],
        [hub, 'summary-old'],
      ]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([
        [
          hub,
          new HoldPlaceholder(
            `${PREP_TAG} Standup`,
            new Date(newStart.getTime() - BUFFER_MS),
            newStart,
          ),
        ],
        [
          hub,
          new HoldPlaceholder(
            `${SUMMARY_TAG} Standup`,
            newEnd,
            new Date(newEnd.getTime() + BUFFER_MS),
          ),
        ],
      ]);
    });

    it('recreates buffers when an already-processed event is renamed with the same time slot', () => {
      const meetingStart = new Date('2020-01-02T09:00:00Z');
      const meetingEnd = new Date('2020-01-02T09:30:00Z');
      const processedSnapshot = new Map([
        [
          'meeting-1',
          {
            startMs: meetingStart.getTime(),
            endMs: meetingEnd.getTime(),
            title: 'Old Name',
          },
        ],
      ]);
      const { useCase, calendarPort } = createMocks(
        {
          own: [
            new CalendarEvent(
              'meeting-1',
              'New Name',
              meetingStart,
              meetingEnd,
              false,
              false,
            ),
          ],
          hub: [
            new CalendarEvent(
              'prep-old-name',
              `${PREP_TAG} Old Name`,
              new Date(meetingStart.getTime() - BUFFER_MS),
              meetingStart,
              false,
              false,
            ),
            new CalendarEvent(
              'summary-old-name',
              `${SUMMARY_TAG} Old Name`,
              meetingEnd,
              new Date(meetingEnd.getTime() + BUFFER_MS),
              false,
              false,
            ),
          ],
        },
        CONFIG,
        processedSnapshot,
      );

      useCase.execute(NOW);

      expect(calendarPort.deleteEvent.mock.calls).toEqual([
        [hub, 'prep-old-name'],
        [hub, 'summary-old-name'],
      ]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([
        [
          hub,
          new HoldPlaceholder(
            `${PREP_TAG} New Name`,
            new Date(meetingStart.getTime() - BUFFER_MS),
            meetingStart,
          ),
        ],
        [
          hub,
          new HoldPlaceholder(
            `${SUMMARY_TAG} New Name`,
            meetingEnd,
            new Date(meetingEnd.getTime() + BUFFER_MS),
          ),
        ],
      ]);
    });

    it('deletes orphaned buffer events from the hub when their source meeting is removed', () => {
      const orphanStart = new Date('2020-01-02T08:55:00Z');
      const orphanEnd = new Date('2020-01-02T09:00:00Z');
      const { useCase, calendarPort } = createMocks({
        own: [],
        hub: [
          new CalendarEvent(
            'orphan-prep',
            `${PREP_TAG} Cancelled Meeting`,
            orphanStart,
            orphanEnd,
            false,
            false,
          ),
        ],
      });

      useCase.execute(NOW);

      expect(calendarPort.deleteEvent.mock.calls).toEqual([
        [hub, 'orphan-prep'],
      ]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
    });

    it('keeps hub buffers that already match the current meeting schedule for a new event', () => {
      const meetingStart = new Date('2020-01-02T09:00:00Z');
      const meetingEnd = new Date('2020-01-02T09:30:00Z');
      const prepStart = new Date(meetingStart.getTime() - BUFFER_MS);
      const summaryEnd = new Date(meetingEnd.getTime() + BUFFER_MS);
      const { useCase, calendarPort } = createMocks({
        own: [
          new CalendarEvent(
            'meeting-1',
            'Standup',
            meetingStart,
            meetingEnd,
            false,
            false,
          ),
        ],
        hub: [
          new CalendarEvent(
            'prep-1',
            `${PREP_TAG} Standup`,
            prepStart,
            meetingStart,
            false,
            false,
          ),
          new CalendarEvent(
            'summary-1',
            `${SUMMARY_TAG} Standup`,
            meetingEnd,
            summaryEnd,
            false,
            false,
          ),
        ],
      });

      useCase.execute(NOW);

      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    });

    it('saves processed snapshots for all qualifying own events after each run', () => {
      const meetingStart = new Date('2020-01-02T09:00:00Z');
      const meetingEnd = new Date('2020-01-02T09:30:00Z');
      const { useCase, statePort } = createMocks({
        own: [
          new CalendarEvent(
            'meeting-1',
            'Standup',
            meetingStart,
            meetingEnd,
            false,
            false,
          ),
        ],
        hub: [],
      });

      useCase.execute(NOW);

      const [savedSnapshots] =
        statePort.setProcessedEventSnapshots.mock.calls[0];
      expect(savedSnapshots.get('meeting-1')).toEqual({
        startMs: meetingStart.getTime(),
        endMs: meetingEnd.getTime(),
        title: 'Standup',
      });
    });

    it('removes stale snapshot entries for events no longer in the own calendar', () => {
      const goneStart = new Date('2020-01-02T09:00:00Z');
      const goneEnd = new Date('2020-01-02T09:30:00Z');
      const staleSnapshot = new Map([
        [
          'gone-event',
          {
            startMs: goneStart.getTime(),
            endMs: goneEnd.getTime(),
            title: 'Gone Meeting',
          },
        ],
      ]);
      const { useCase, statePort } = createMocks(
        { own: [], hub: [] },
        CONFIG,
        staleSnapshot,
      );

      useCase.execute(NOW);

      const [savedSnapshots] =
        statePort.setProcessedEventSnapshots.mock.calls[0];
      expect(savedSnapshots.has('gone-event')).toBe(false);
    });

    it('deletes legacy bracket-format prep and summary events from the hub calendar', () => {
      const legacyPrepStart = new Date('2020-01-02T08:45:00Z');
      const legacyPrepEnd = new Date('2020-01-02T09:00:00Z');
      const legacySummaryStart = new Date('2020-01-02T09:30:00Z');
      const legacySummaryEnd = new Date('2020-01-02T09:45:00Z');
      const { useCase, calendarPort } = createMocks({
        own: [],
        hub: [
          new CalendarEvent(
            'legacy-prep',
            '[PREP] Standup',
            legacyPrepStart,
            legacyPrepEnd,
            false,
            false,
          ),
          new CalendarEvent(
            'legacy-summary',
            '[SUMMARY] Standup',
            legacySummaryStart,
            legacySummaryEnd,
            false,
            false,
          ),
        ],
      });

      useCase.execute(NOW);

      expect(calendarPort.deleteEvent.mock.calls).toEqual([
        [hub, 'legacy-prep'],
        [hub, 'legacy-summary'],
      ]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
    });

    it('logs and skips calendar mutations when HUB_CALENDAR_ID is missing', () => {
      const { useCase, calendarPort, logPort } = createMocks(
        { own: [], hub: [] },
        { SYNC_DAYS: String(SYNC_DAYS) },
      );

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and skips calendar mutations when SYNC_DAYS is not a positive integer', () => {
      const { useCase, calendarPort, logPort } = createMocks(
        { own: [], hub: [] },
        { ...CONFIG, SYNC_DAYS: 'abc' },
      );

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and skips calendar mutations when SYNC_DAYS is zero', () => {
      const { useCase, calendarPort, logPort } = createMocks(
        { own: [], hub: [] },
        { ...CONFIG, SYNC_DAYS: '0' },
      );

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and skips calendar mutations when SYNC_DAYS is missing', () => {
      const { useCase, calendarPort, logPort } = createMocks(
        { own: [], hub: [] },
        { HUB_CALENDAR_ID },
      );

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('deletes legacy bracket-format prep and summary buffer events found on the own calendar', () => {
      const legacyPrepStart = new Date('2020-01-02T08:55:00Z');
      const legacyPrepEnd = new Date('2020-01-02T09:00:00Z');
      const legacySummaryStart = new Date('2020-01-02T09:30:00Z');
      const legacySummaryEnd = new Date('2020-01-02T09:35:00Z');
      const { useCase, calendarPort, own } = createMocks({
        own: [
          new CalendarEvent(
            'legacy-prep',
            `${LEGACY_PREP_TAG} Standup`,
            legacyPrepStart,
            legacyPrepEnd,
            false,
            false,
          ),
          new CalendarEvent(
            'legacy-summary',
            `${LEGACY_SUMMARY_TAG} Standup`,
            legacySummaryStart,
            legacySummaryEnd,
            false,
            false,
          ),
        ],
        hub: [],
      });

      useCase.execute(NOW);

      expect(calendarPort.deleteEvent.mock.calls).toEqual([
        [own, 'legacy-prep'],
        [own, 'legacy-summary'],
      ]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
    });

    it('reads each calendar exactly once per run', () => {
      const { useCase, calendarPort } = createMocks({ own: [], hub: [] });

      useCase.execute(NOW);

      const enumeratedCalendarTypes =
        calendarPort.listTimedEvents.mock.calls.map(
          ([calendar]: [CalendarRef, Date, Date]) => calendar.type,
        );
      expect(enumeratedCalendarTypes.sort()).toEqual(['hub', 'own']);
    });
  });
});
