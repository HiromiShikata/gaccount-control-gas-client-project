import { CalendarRef } from '../domain/entities/CalendarRef';
import { HoldPlaceholder } from '../domain/entities/HoldPlaceholder';
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

    it('does not throw when deleteEvent throws because the event was already deleted', () => {
      const alreadyDeletedEvent = makeEvent({
        deleteEvent: () => {
          throw new Error(
            'The calendar event does not exist, or it has already been deleted.',
          );
        },
      });
      const calendar = makeCalendar(alreadyDeletedEvent);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      expect(() =>
        port.deleteEvent(makeOwnCalendarRef(), 'event-id'),
      ).not.toThrow();
    });

    it('logs an error to console.error when deleteEvent throws', () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const alreadyDeletedEvent = makeEvent({
        deleteEvent: () => {
          throw new Error(
            'The calendar event does not exist, or it has already been deleted.',
          );
        },
      });
      const calendar = makeCalendar(alreadyDeletedEvent);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.deleteEvent(makeOwnCalendarRef(), 'event-id');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete event event-id'),
      );
      consoleSpy.mockRestore();
    });

    it('does nothing when the event is not found', () => {
      const calendar = makeCalendar(null);
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      expect(() =>
        port.deleteEvent(makeOwnCalendarRef(), 'missing-id'),
      ).not.toThrow();
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

  describe('createHoldPlaceholder', () => {
    it('does not call setTransparency on the created event', () => {
      const placeholder = new HoldPlaceholder(
        'HOLD test',
        new Date('2020-01-01T09:00:00Z'),
        new Date('2020-01-01T10:00:00Z'),
      );
      const createdEvent = {
        removeAllReminders: jest.fn(),
        setTransparency: jest.fn(),
      } as unknown as GoogleAppsScript.Calendar.CalendarEvent;
      const calendar = {
        getEventById: jest.fn(),
        createEvent: jest.fn(() => createdEvent),
      } as unknown as GoogleAppsScript.Calendar.Calendar;
      setupCalendarApp(calendar);
      const port = new CalendarAppCalendarPort();

      port.createHoldPlaceholder(makeOwnCalendarRef(), placeholder);

      expect(createdEvent.setTransparency).not.toHaveBeenCalled();
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
