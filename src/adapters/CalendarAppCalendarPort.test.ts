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
  describe('deleteEvent', () => {
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

  describe('setEventColor', () => {
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
