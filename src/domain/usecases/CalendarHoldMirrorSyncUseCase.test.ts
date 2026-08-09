import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import { HOLD_TAG } from '../entities/HoldPlaceholderReconciliation';
import { CalendarHoldMirrorSyncUseCase } from './CalendarHoldMirrorSyncUseCase';

const OWN_DOMAIN = 'example.com';
const HUB_CALENDAR_ID = 'hub-calendar-id';
const NOW = new Date('2020-01-01T00:00:00Z');

const CONFIG: Record<string, string> = {
  HUB_CALENDAR_ID,
  SYNC_DAYS: '90',
  MEETING_OK_TAG: '#meeting-ok',
  MEETING_OK_TITLE: 'Available for meeting',
};

const createMocks = (
  eventsByCalendar: { own: CalendarEvent[]; hub: CalendarEvent[] },
  config: Record<string, string> = CONFIG,
) => {
  const calendarPort = {
    exists: jest.fn((_calendar: CalendarRef): boolean => true),
    listTimedEvents: jest.fn(
      (calendar: CalendarRef, _from: Date, _to: Date): CalendarEvent[] =>
        calendar.type === 'own' ? eventsByCalendar.own : eventsByCalendar.hub,
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
  const useCase = new CalendarHoldMirrorSyncUseCase(
    calendarPort,
    configPort,
    logPort,
  );
  return { useCase, calendarPort, configPort, logPort };
};

describe('CalendarHoldMirrorSyncUseCase', () => {
  describe('execute', () => {
    it('pushes own events to the hub and pulls hub events to the own calendar', () => {
      const standupStart = new Date('2020-01-01T09:00:00Z');
      const standupEnd = new Date('2020-01-01T09:30:00Z');
      const externalStart = new Date('2020-01-02T10:00:00Z');
      const externalEnd = new Date('2020-01-02T11:00:00Z');
      const staleHoldStart = new Date('2020-01-05T00:00:00Z');
      const staleHoldEnd = new Date('2020-01-05T00:30:00Z');
      const stalePushStart = new Date('2020-01-03T00:00:00Z');
      const stalePushEnd = new Date('2020-01-03T00:30:00Z');

      const ownEvents: CalendarEvent[] = [
        new CalendarEvent(
          'own-standup',
          'Standup',
          standupStart,
          standupEnd,
          false,
          false,
        ),
        new CalendarEvent(
          'own-hold-stale',
          HOLD_TAG,
          staleHoldStart,
          staleHoldEnd,
          false,
          false,
        ),
      ];
      const hubEvents: CalendarEvent[] = [
        new CalendarEvent(
          'hub-external',
          'External Sync',
          externalStart,
          externalEnd,
          false,
          false,
        ),
        new CalendarEvent(
          'hub-oldtitle',
          `${HOLD_TAG} ${OWN_DOMAIN} OldTitle`,
          stalePushStart,
          stalePushEnd,
          false,
          false,
        ),
      ];

      const { useCase, calendarPort, logPort } = createMocks({
        own: ownEvents,
        hub: hubEvents,
      });

      useCase.execute(NOW, OWN_DOMAIN);

      const hub: CalendarRef = { type: 'hub', hubCalendarId: HUB_CALENDAR_ID };
      const own: CalendarRef = { type: 'own' };

      expect(calendarPort.deleteEvent.mock.calls).toEqual([
        [hub, 'hub-oldtitle'],
        [own, 'own-hold-stale'],
      ]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([
        [
          hub,
          new HoldPlaceholder(
            `${HOLD_TAG} ${OWN_DOMAIN} Standup`,
            standupStart,
            standupEnd,
          ),
        ],
        [own, new HoldPlaceholder(HOLD_TAG, externalStart, externalEnd)],
      ]);
      expect(logPort.error.mock.calls).toEqual([]);
    });

    it('logs and performs no calendar mutations when a required config value is missing', () => {
      const { useCase, calendarPort, logPort } = createMocks(
        { own: [], hub: [] },
        {
          SYNC_DAYS: '90',
          MEETING_OK_TAG: '#meeting-ok',
          MEETING_OK_TITLE: 'x',
        },
      );

      useCase.execute(NOW, OWN_DOMAIN);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and performs no calendar mutations when SYNC_DAYS is not a positive integer', () => {
      const { useCase, calendarPort, logPort } = createMocks(
        { own: [], hub: [] },
        { ...CONFIG, SYNC_DAYS: 'abc' },
      );

      useCase.execute(NOW, OWN_DOMAIN);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and performs no calendar mutations when the hub calendar is not accessible', () => {
      const { useCase, calendarPort, logPort } = createMocks({
        own: [],
        hub: [],
      });
      calendarPort.exists.mockReturnValue(false);

      useCase.execute(NOW, OWN_DOMAIN);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('enumerates each calendar exactly once per run', () => {
      const sharedStart = new Date('2020-01-04T09:00:00Z');
      const sharedEnd = new Date('2020-01-04T10:00:00Z');
      const { useCase, calendarPort } = createMocks({
        own: [
          new CalendarEvent(
            'own-event',
            'Own meeting',
            sharedStart,
            sharedEnd,
            false,
            false,
          ),
        ],
        hub: [
          new CalendarEvent(
            'hub-event',
            'Hub meeting',
            sharedStart,
            sharedEnd,
            false,
            false,
          ),
        ],
      });

      useCase.execute(NOW, OWN_DOMAIN);

      const enumeratedCalendarTypes =
        calendarPort.listTimedEvents.mock.calls.map(
          ([calendar]: [CalendarRef, Date, Date]) => calendar.type,
        );
      expect(enumeratedCalendarTypes.sort()).toEqual(['hub', 'own']);
    });
  });
});
