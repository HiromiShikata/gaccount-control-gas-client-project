import { CalendarRef } from '../domain/entities/CalendarRef';
import { CalendarAppCalendarPort } from './CalendarAppCalendarPort';

const makeOwnCalendarRef = (): CalendarRef => ({ type: 'own' });
const makeHubCalendarRef = (): CalendarRef => ({
  type: 'hub',
  hubCalendarId: 'hub-cal-id',
});

const makeEvent = (
  overrides: Partial<{
    deleteEvent: () => void;
    setColor: (color: string) => void;
  }> = {},
): GoogleAppsScript.Calendar.CalendarEvent =>
  ({
    deleteEvent: jest.fn(),
    setColor: jest.fn(),
    ...overrides,
  }) as unknown as GoogleAppsScript.Calendar.CalendarEvent;

const makeCalendar = (
  event: GoogleAppsScript.Calendar.CalendarEvent | null,
): GoogleAppsScript.Calendar.Calendar =>
  ({
    getEventById: jest.fn((_id: string) => event),
    createEvent: jest.fn(),
  }) as unknown as GoogleAppsScript.Calendar.Calendar;

const setupCalendarApp = (
  calendar: GoogleAppsScript.Calendar.Calendar,
): void => {
  (globalThis as unknown as Record<string, unknown>).CalendarApp = {
    getDefaultCalendar: jest.fn(() => calendar),
    getCalendarById: jest.fn((_id: string) => calendar),
    GuestStatus: { NO: 'NO' },
    EventTransparency: { OPAQUE: 'OPAQUE' },
    EventColor: { PALE_RED: 'PALE_RED' },
  };
};

describe('CalendarAppCalendarPort', () => {
  describe('listTimedEvents', () => {
    const makeGasEvent = (
      id: string,
      title: string,
      startMs: number,
      endMs: number,
    ): GoogleAppsScript.Calendar.CalendarEvent =>
      ({
        getId: jest.fn(() => id),
        getTitle: jest.fn(() => title),
        getStartTime: jest.fn(() => ({ getTime: () => startMs })),
        getEndTime: jest.fn(() => ({ getTime: () => endMs })),
        isAllDayEvent: jest.fn(() => false),
        getMyStatus: jest.fn(() => ''),
      }) as unknown as GoogleAppsScript.Calendar.CalendarEvent;

    it('calls getEvents only once when called twice with identical arguments', () => {
      const from = new Date('2020-01-01T00:00:00Z');
      const to = new Date('2020-01-15T00:00:00Z');
      const getEvents = jest.fn(() => [
        makeGasEvent('ev-1', 'Meeting', from.getTime(), to.getTime()),
      ]);
      const calendar = {
        getEvents,
        getEventById: jest.fn(),
        createEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.listTimedEvents(makeOwnCalendarRef(), from, to);
      port.listTimedEvents(makeOwnCalendarRef(), from, to);

      expect(getEvents).toHaveBeenCalledTimes(1);
    });

    it('calls getEvents separately for different date ranges on the same calendar', () => {
      const from1 = new Date('2020-01-01T00:00:00Z');
      const to1 = new Date('2020-01-15T00:00:00Z');
      const from2 = new Date('2020-02-01T00:00:00Z');
      const to2 = new Date('2020-02-15T00:00:00Z');
      const getEvents = jest.fn(() => []);
      const calendar = {
        getEvents,
        getEventById: jest.fn(),
        createEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.listTimedEvents(makeOwnCalendarRef(), from1, to1);
      port.listTimedEvents(makeOwnCalendarRef(), from2, to2);

      expect(getEvents).toHaveBeenCalledTimes(2);
    });

    it('calls getEvents separately for own and hub calendars with the same date range', () => {
      const from = new Date('2020-01-01T00:00:00Z');
      const to = new Date('2020-01-15T00:00:00Z');
      const getEvents = jest.fn(() => []);
      const calendar = {
        getEvents,
        getEventById: jest.fn(),
        createEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.listTimedEvents(makeOwnCalendarRef(), from, to);
      port.listTimedEvents(makeHubCalendarRef(), from, to);

      expect(getEvents).toHaveBeenCalledTimes(2);
    });

    it('returns the same event list on repeated calls with identical arguments', () => {
      const from = new Date('2020-01-01T00:00:00Z');
      const to = new Date('2020-01-15T00:00:00Z');
      const eventStart = new Date('2020-01-05T09:00:00Z');
      const eventEnd = new Date('2020-01-05T10:00:00Z');
      const getEvents = jest.fn(() => [
        makeGasEvent(
          'ev-1',
          'Standup',
          eventStart.getTime(),
          eventEnd.getTime(),
        ),
      ]);
      const calendar = {
        getEvents,
        getEventById: jest.fn(),
        createEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      const first = port.listTimedEvents(makeOwnCalendarRef(), from, to);
      const second = port.listTimedEvents(makeOwnCalendarRef(), from, to);

      expect(first).toEqual(second);
      expect(first[0].id).toBe('ev-1');
    });
    it('maps each event to its id, title, start, end, all-day flag and declined status', () => {
      const from = new Date('2020-01-01T00:00:00Z');
      const to = new Date('2020-01-15T00:00:00Z');
      const declinedEvent = {
        getId: jest.fn(() => 'ev-declined'),
        getTitle: jest.fn(() => 'Declined meeting'),
        getStartTime: jest.fn(() => ({
          getTime: () => Date.parse('2020-01-06T13:00:00Z'),
        })),
        getEndTime: jest.fn(() => ({
          getTime: () => Date.parse('2020-01-06T14:00:00Z'),
        })),
        isAllDayEvent: jest.fn(() => true),
        getMyStatus: jest.fn(() => 'NO'),
      } as unknown as GoogleAppsScript.Calendar.CalendarEvent;
      const calendar = {
        getEvents: jest.fn(() => [declinedEvent]),
        getEventById: jest.fn(),
        createEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      (globalThis as unknown as Record<string, unknown>).CalendarApp = {
        getDefaultCalendar: jest.fn(() => calendar),
        getCalendarById: jest.fn((_id: string) => calendar),
        GuestStatus: { NO: 'NO' },
        EventTransparency: { OPAQUE: 'OPAQUE' },
        EventColor: { PALE_RED: 'PALE_RED' },
      };
      const port = new CalendarAppCalendarPort();

      const events = port.listTimedEvents(makeOwnCalendarRef(), from, to);
      const mapped = events.map(
        ({ id, title, startAt, endAt, isAllDay, isDeclined }) => ({
          id,
          title,
          startAt,
          endAt,
          isAllDay,
          isDeclined,
        }),
      );
      expect(mapped).toEqual([
        {
          id: 'ev-declined',
          title: 'Declined meeting',
          startAt: new Date('2020-01-06T13:00:00Z'),
          endAt: new Date('2020-01-06T14:00:00Z'),
          isAllDay: true,
          isDeclined: true,
        },
      ]);
    });
  });

  describe('exists', () => {
    it('returns true for the own calendar without resolving any calendar', () => {
      const getCalendarById = jest.fn(() => null);
      (globalThis as unknown as Record<string, unknown>).CalendarApp = {
        getDefaultCalendar: jest.fn(),
        getCalendarById,
        GuestStatus: { NO: 'NO' },
        EventTransparency: { OPAQUE: 'OPAQUE' },
        EventColor: { PALE_RED: 'PALE_RED' },
      };
      const port = new CalendarAppCalendarPort();

      expect(port.exists(makeOwnCalendarRef())).toBe(true);
      expect(getCalendarById).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'returns true when the hub calendar is found',
        found: true,
        expected: true,
      },
      {
        name: 'returns false when the hub calendar is not found',
        found: false,
        expected: false,
      },
    ])('$name', ({ found, expected }) => {
      const calendar = makeCalendar(null);
      (globalThis as unknown as Record<string, unknown>).CalendarApp = {
        getDefaultCalendar: jest.fn(() => calendar),
        getCalendarById: jest.fn((_id: string) => (found ? calendar : null)),
        GuestStatus: { NO: 'NO' },
        EventTransparency: { OPAQUE: 'OPAQUE' },
        EventColor: { PALE_RED: 'PALE_RED' },
      };
      const port = new CalendarAppCalendarPort();

      expect(port.exists(makeHubCalendarRef())).toBe(expected);
    });
  });

  describe('deleteEvent', () => {
    it('does not call getEventById when the event was already loaded by listTimedEvents', () => {
      const from = new Date('2020-01-01T00:00:00Z');
      const to = new Date('2020-01-31T00:00:00Z');
      const eventId = 'ev-1';
      const gasEvent = {
        getId: jest.fn(() => eventId),
        getTitle: jest.fn(() => 'Meeting'),
        getStartTime: jest.fn(() => ({
          getTime: () => new Date('2020-01-05T09:00:00Z').getTime(),
        })),
        getEndTime: jest.fn(() => ({
          getTime: () => new Date('2020-01-05T10:00:00Z').getTime(),
        })),
        isAllDayEvent: jest.fn(() => false),
        getMyStatus: jest.fn(() => ''),
        deleteEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.CalendarEvent;
      const getEvents = jest.fn(() => [gasEvent]);
      const getEventById = jest.fn(() => gasEvent);
      const calendar = {
        getEvents,
        getEventById,
        createEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.listTimedEvents(makeOwnCalendarRef(), from, to);
      port.deleteEvent(makeOwnCalendarRef(), eventId);

      expect(getEventById).not.toHaveBeenCalled();
      expect(gasEvent.deleteEvent).toHaveBeenCalledTimes(1);
    });

    it('propagates an error thrown by deleteEvent unchanged, without logging it', () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const deleteError = new Error(
        'The calendar event does not exist, or it has already been deleted.',
      );
      const event = makeEvent({
        deleteEvent: () => {
          throw deleteError;
        },
      });
      const calendar = makeCalendar(event);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      expect(() => port.deleteEvent(makeOwnCalendarRef(), 'event-id')).toThrow(
        deleteError,
      );
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('is a no-op when the event is not found', () => {
      const getEventById = jest.fn((_id: string) => null);
      const calendar = {
        getEvents: jest.fn(),
        getEventById,
        createEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      expect(() =>
        port.deleteEvent(makeOwnCalendarRef(), 'missing-id'),
      ).not.toThrow();
      expect(getEventById).toHaveBeenCalledWith('missing-id');
    });

    it('calls deleteEvent on the found event', () => {
      const event = makeEvent();
      const calendar = makeCalendar(event);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.deleteEvent(makeOwnCalendarRef(), 'event-id');

      expect(event.deleteEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('calendar resolution', () => {
    it('calls getCalendarById only once for multiple deleteEvent calls on the same hub calendar', () => {
      const event = makeEvent();
      const calendar = makeCalendar(event);
      const getCalendarById = jest.fn((_id: string) => calendar);
      (globalThis as unknown as Record<string, unknown>).CalendarApp = {
        getDefaultCalendar: jest.fn(() => calendar),
        getCalendarById,
        GuestStatus: { NO: 'NO' },
        EventTransparency: { OPAQUE: 'OPAQUE' },
        EventColor: { PALE_RED: 'PALE_RED' },
      };
      const port = new CalendarAppCalendarPort();

      port.deleteEvent(makeHubCalendarRef(), 'event-1');
      port.deleteEvent(makeHubCalendarRef(), 'event-2');

      expect(getCalendarById).toHaveBeenCalledTimes(1);
    });
  });

  describe('setEventColor', () => {
    it('does not call getEventById when the event was already loaded by listTimedEvents', () => {
      const from = new Date('2020-01-01T00:00:00Z');
      const to = new Date('2020-01-31T00:00:00Z');
      const eventId = 'hub-ev-1';
      const gasEvent = {
        getId: jest.fn(() => eventId),
        getTitle: jest.fn(() => 'External Meeting'),
        getStartTime: jest.fn(() => ({
          getTime: () => new Date('2020-01-10T14:00:00Z').getTime(),
        })),
        getEndTime: jest.fn(() => ({
          getTime: () => new Date('2020-01-10T15:00:00Z').getTime(),
        })),
        isAllDayEvent: jest.fn(() => false),
        getMyStatus: jest.fn(() => ''),
        setColor: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.CalendarEvent;
      const getEvents = jest.fn(() => [gasEvent]);
      const getEventById = jest.fn(() => gasEvent);
      const calendar = {
        getEvents,
        getEventById,
        createEvent: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.listTimedEvents(makeHubCalendarRef(), from, to);
      port.setEventColor(makeHubCalendarRef(), eventId, 'flamingo');

      expect(getEventById).not.toHaveBeenCalled();
      expect(gasEvent.setColor).toHaveBeenCalledWith('PALE_RED');
    });

    it('does not throw when setColor throws because the event was already deleted', () => {
      const alreadyDeletedEvent = makeEvent({
        setColor: () => {
          throw new Error(
            'The calendar event does not exist, or it has already been deleted.',
          );
        },
      });
      const calendar = makeCalendar(alreadyDeletedEvent);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      expect(() =>
        port.setEventColor(makeHubCalendarRef(), 'event-id', 'flamingo'),
      ).not.toThrow();
    });

    it('logs an error to console.error when setColor throws', () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const alreadyDeletedEvent = makeEvent({
        setColor: () => {
          throw new Error(
            'The calendar event does not exist, or it has already been deleted.',
          );
        },
      });
      const calendar = makeCalendar(alreadyDeletedEvent);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.setEventColor(makeHubCalendarRef(), 'event-id', 'flamingo');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set color of event event-id'),
      );
      consoleSpy.mockRestore();
    });

    it('does nothing when the event is not found', () => {
      const calendar = makeCalendar(null);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      expect(() =>
        port.setEventColor(makeOwnCalendarRef(), 'missing-id', 'flamingo'),
      ).not.toThrow();
    });

    it('calls setColor with PALE_RED when color is flamingo', () => {
      const event = makeEvent();
      const calendar = makeCalendar(event);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.setEventColor(makeHubCalendarRef(), 'event-id', 'flamingo');

      expect(event.setColor).toHaveBeenCalledWith('PALE_RED');
    });
  });
});
