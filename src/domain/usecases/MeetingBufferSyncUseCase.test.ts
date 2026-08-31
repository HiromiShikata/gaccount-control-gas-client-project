import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import { PREP_TAG, SUMMARY_TAG } from '../entities/MeetingBufferReconciliation';
import { MeetingBufferSyncUseCase } from './MeetingBufferSyncUseCase';

const NOW = new Date('2020-01-01T00:00:00Z');
const SYNC_DAYS = 90;
const CONFIG: Record<string, string> = { SYNC_DAYS: String(SYNC_DAYS) };
const BUFFER_MS = 5 * 60 * 1000;

const createMocks = (
  ownEvents: CalendarEvent[],
  config: Record<string, string> = CONFIG,
) => {
  const own: CalendarRef = { type: 'own' };
  const calendarPort = {
    exists: jest.fn((): boolean => true),
    listTimedEvents: jest.fn(
      (_calendar: CalendarRef, _from: Date, _to: Date): CalendarEvent[] =>
        ownEvents,
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
  const useCase = new MeetingBufferSyncUseCase(
    calendarPort,
    configPort,
    logPort,
  );
  return { useCase, calendarPort, configPort, logPort, own };
};

describe('MeetingBufferSyncUseCase', () => {
  describe('execute', () => {
    it('creates prep and summary buffers for own timed events', () => {
      const meetingStart = new Date('2020-01-02T09:00:00Z');
      const meetingEnd = new Date('2020-01-02T09:30:00Z');
      const { useCase, calendarPort, own } = createMocks([
        new CalendarEvent(
          'meeting-1',
          'Standup',
          meetingStart,
          meetingEnd,
          false,
          false,
        ),
      ]);

      useCase.execute(NOW);

      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([
        [
          own,
          new HoldPlaceholder(
            `${PREP_TAG} Standup`,
            new Date(meetingStart.getTime() - BUFFER_MS),
            meetingStart,
          ),
        ],
        [
          own,
          new HoldPlaceholder(
            `${SUMMARY_TAG} Standup`,
            meetingEnd,
            new Date(meetingEnd.getTime() + BUFFER_MS),
          ),
        ],
      ]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    });

    it('deletes orphaned buffer events when their source meeting is removed', () => {
      const orphanStart = new Date('2020-01-02T08:55:00Z');
      const orphanEnd = new Date('2020-01-02T09:00:00Z');
      const { useCase, calendarPort, own } = createMocks([
        new CalendarEvent(
          'orphan-prep',
          `${PREP_TAG} Cancelled Meeting`,
          orphanStart,
          orphanEnd,
          false,
          false,
        ),
      ]);

      useCase.execute(NOW);

      expect(calendarPort.deleteEvent.mock.calls).toEqual([
        [own, 'orphan-prep'],
      ]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
    });

    it('keeps buffers that already match the current meeting schedule', () => {
      const meetingStart = new Date('2020-01-02T09:00:00Z');
      const meetingEnd = new Date('2020-01-02T09:30:00Z');
      const prepStart = new Date(meetingStart.getTime() - BUFFER_MS);
      const summaryEnd = new Date(meetingEnd.getTime() + BUFFER_MS);
      const { useCase, calendarPort } = createMocks([
        new CalendarEvent(
          'meeting-1',
          'Standup',
          meetingStart,
          meetingEnd,
          false,
          false,
        ),
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
      ]);

      useCase.execute(NOW);

      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    });

    it('logs and skips calendar mutations when SYNC_DAYS is not a positive integer', () => {
      const { useCase, calendarPort, logPort } = createMocks([], {
        SYNC_DAYS: 'abc',
      });

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and skips calendar mutations when SYNC_DAYS is zero', () => {
      const { useCase, calendarPort, logPort } = createMocks([], {
        SYNC_DAYS: '0',
      });

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and skips calendar mutations when SYNC_DAYS is missing', () => {
      const { useCase, calendarPort, logPort } = createMocks([], {});

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('reads only the own calendar once per run', () => {
      const { useCase, calendarPort } = createMocks([]);

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls.length).toBe(1);
      expect(calendarPort.listTimedEvents.mock.calls[0][0]).toEqual({
        type: 'own',
      });
    });
  });
});
