import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarEventColor } from '../entities/CalendarEventColor';
import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import { CalendarEventColorSyncUseCase } from './CalendarEventColorSyncUseCase';

const NOW = new Date('2020-01-01T00:00:00Z');
const SYNC_DAYS = 90;
const CONFIG: Record<string, string> = {
  SYNC_DAYS: String(SYNC_DAYS),
};

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
  const useCase = new CalendarEventColorSyncUseCase(
    calendarPort,
    configPort,
    logPort,
  );
  return { useCase, calendarPort, configPort, logPort, own };
};

describe('CalendarEventColorSyncUseCase', () => {
  describe('execute', () => {
    it('sets flamingo color on own calendar events whose title starts with Moving', () => {
      const movingStart = new Date('2020-01-02T09:00:00Z');
      const movingEnd = new Date('2020-01-02T10:00:00Z');
      const { useCase, calendarPort, own } = createMocks([
        new CalendarEvent(
          'moving-1',
          'Moving to new office',
          movingStart,
          movingEnd,
          false,
          false,
        ),
      ]);

      useCase.execute(NOW);

      expect(calendarPort.setEventColor.mock.calls).toEqual([
        [own, 'moving-1', 'flamingo'],
      ]);
    });

    it('does not set color on events whose title does not start with Moving', () => {
      const otherStart = new Date('2020-01-02T09:00:00Z');
      const otherEnd = new Date('2020-01-02T10:00:00Z');
      const { useCase, calendarPort } = createMocks([
        new CalendarEvent(
          'standup-1',
          'Standup',
          otherStart,
          otherEnd,
          false,
          false,
        ),
        new CalendarEvent(
          'planning-1',
          'Planning session Moving agenda',
          otherStart,
          otherEnd,
          false,
          false,
        ),
      ]);

      useCase.execute(NOW);

      expect(calendarPort.setEventColor.mock.calls).toEqual([]);
    });

    it('logs and skips when SYNC_DAYS config is missing', () => {
      const { useCase, calendarPort, logPort } = createMocks([], {});

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(calendarPort.setEventColor.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and skips when SYNC_DAYS is not a positive integer', () => {
      const { useCase, calendarPort, logPort } = createMocks([], {
        SYNC_DAYS: 'abc',
      });

      useCase.execute(NOW);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(calendarPort.setEventColor.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });
  });
});
