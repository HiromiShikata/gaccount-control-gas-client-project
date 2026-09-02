import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarEventColor } from '../entities/CalendarEventColor';
import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import { PREP_TAG, SUMMARY_TAG } from '../entities/MeetingBufferReconciliation';
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
    setEventColor: jest.fn(
      (
        _calendar: CalendarRef,
        _eventId: string,
        _color: CalendarEventColor,
      ): void => {},
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
  const useCase = new MeetingBufferSyncUseCase(
    calendarPort,
    configPort,
    logPort,
  );
  return { useCase, calendarPort, configPort, logPort, own };
};

describe('MeetingBufferSyncUseCase', () => {
  describe('execute', () => {
    it('creates prep and summary buffers on the hub calendar for own timed events', () => {
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

    it('keeps hub buffers that already match the current meeting schedule', () => {
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

    it('deletes legacy prep and summary buffer events found on the own calendar', () => {
      const legacyPrepStart = new Date('2020-01-02T08:55:00Z');
      const legacyPrepEnd = new Date('2020-01-02T09:00:00Z');
      const legacySummaryStart = new Date('2020-01-02T09:30:00Z');
      const legacySummaryEnd = new Date('2020-01-02T09:35:00Z');
      const { useCase, calendarPort, own } = createMocks({
        own: [
          new CalendarEvent(
            'legacy-prep',
            `${PREP_TAG} Standup`,
            legacyPrepStart,
            legacyPrepEnd,
            false,
            false,
          ),
          new CalendarEvent(
            'legacy-summary',
            `${SUMMARY_TAG} Standup`,
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
