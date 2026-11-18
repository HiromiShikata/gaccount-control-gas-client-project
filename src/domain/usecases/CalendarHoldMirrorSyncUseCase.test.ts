import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarEventColor } from '../entities/CalendarEventColor';
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
    removeHoldPlaceholderReminders: jest.fn(
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
            `${HOLD_TAG} ${OWN_DOMAIN}`,
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

    it('does not push a hold placeholder for an own event already present as a direct non-hold invite on the hub at the exact same time', () => {
      const meetingStart = new Date('2020-01-01T09:00:00Z');
      const meetingEnd = new Date('2020-01-01T09:30:00Z');

      const ownEvents: CalendarEvent[] = [
        new CalendarEvent(
          'own-meeting',
          'Weekly scrum planning',
          meetingStart,
          meetingEnd,
          false,
          false,
        ),
      ];
      const hubEvents: CalendarEvent[] = [
        new CalendarEvent(
          'hub-direct-invite',
          'Weekly scrum planning',
          meetingStart,
          meetingEnd,
          false,
          false,
        ),
      ];

      const { useCase, calendarPort } = createMocks({
        own: ownEvents,
        hub: hubEvents,
      });

      useCase.execute(NOW, OWN_DOMAIN);

      const pushedToHubCalls =
        calendarPort.createHoldPlaceholder.mock.calls.filter(
          ([calendar]: [CalendarRef, HoldPlaceholder]) =>
            calendar.type === 'hub',
        );
      expect(pushedToHubCalls).toEqual([]);
    });
  });
});

describe('CalendarHoldMirrorSyncUseCase hold placeholder duplicates', () => {
  const hub: CalendarRef = { type: 'hub', hubCalendarId: HUB_CALENDAR_ID };
  const own: CalendarRef = { type: 'own' };
  const START = new Date('2020-01-01T09:00:00Z');
  const END = new Date('2020-01-01T09:30:00Z');

  it('deletes every copy of a duplicated hub placeholder but one, and creates none, when the key is desired', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent('own-standup', 'Standup', START, END, false, false),
      ],
      hub: [
        new CalendarEvent(
          'hub-placeholder-b',
          `${HOLD_TAG} ${OWN_DOMAIN}`,
          START,
          END,
          false,
          false,
        ),
        new CalendarEvent(
          'hub-placeholder-a',
          `${HOLD_TAG} ${OWN_DOMAIN}`,
          START,
          END,
          false,
          false,
        ),
      ],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([
      [hub, 'hub-placeholder-b'],
    ]);
    expect(
      calendarPort.createHoldPlaceholder.mock.calls.filter(
        ([calendar]: [CalendarRef, HoldPlaceholder]) => calendar.type === 'hub',
      ),
    ).toEqual([]);
  });

  it('keeps every own hold placeholder whose key is desired on the pull side', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent('own-hold-a', HOLD_TAG, START, END, false, false),
        new CalendarEvent('own-hold-b', HOLD_TAG, START, END, false, false),
      ],
      hub: [
        new CalendarEvent(
          'hub-external',
          'External Sync',
          START,
          END,
          false,
          false,
        ),
      ],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    expect(calendarPort.createHoldPlaceholder.mock.calls).toEqual([]);
  });

  it('deletes every own hold placeholder whose key is no longer desired on the pull side', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent('own-hold-a', HOLD_TAG, START, END, false, false),
        new CalendarEvent('own-hold-b', HOLD_TAG, START, END, false, false),
      ],
      hub: [],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([
      [own, 'own-hold-a'],
      [own, 'own-hold-b'],
    ]);
  });

  it('deletes every copy of a stale hub placeholder whose key is no longer desired', () => {
    const { useCase, calendarPort } = createMocks({
      own: [],
      hub: [
        new CalendarEvent(
          'hub-placeholder-a',
          `${HOLD_TAG} ${OWN_DOMAIN} Gone`,
          START,
          END,
          false,
          false,
        ),
        new CalendarEvent(
          'hub-placeholder-b',
          `${HOLD_TAG} ${OWN_DOMAIN} Gone`,
          START,
          END,
          false,
          false,
        ),
      ],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([
      [hub, 'hub-placeholder-a'],
      [hub, 'hub-placeholder-b'],
    ]);
  });
});

describe('CalendarHoldMirrorSyncUseCase reminder repair and failure handling', () => {
  const HUB: CalendarRef = { type: 'hub', hubCalendarId: HUB_CALENDAR_ID };
  const OWN: CalendarRef = { type: 'own' };
  const meetingStart = new Date('2020-01-02T10:00:00Z');
  const meetingEnd = new Date('2020-01-02T11:00:00Z');
  const hubMeeting = new CalendarEvent(
    'hub-meeting',
    'Meeting',
    meetingStart,
    meetingEnd,
    false,
    false,
  );

  it('removes reminders from an own placeholder that lacks the marker', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent(
          'own-hold',
          HOLD_TAG,
          meetingStart,
          meetingEnd,
          false,
          false,
          false,
        ),
      ],
      hub: [hubMeeting],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.removeHoldPlaceholderReminders).toHaveBeenCalledWith(
      OWN,
      'own-hold',
    );
  });

  it('does not touch an own placeholder that already carries the marker', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent(
          'own-hold',
          HOLD_TAG,
          meetingStart,
          meetingEnd,
          false,
          false,
          true,
        ),
      ],
      hub: [hubMeeting],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.removeHoldPlaceholderReminders).not.toHaveBeenCalled();
    expect(calendarPort.createHoldPlaceholder).not.toHaveBeenCalled();
  });

  it('removes reminders from a kept hub placeholder that lacks the marker', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent(
          'own-standup',
          'Standup',
          meetingStart,
          meetingEnd,
          false,
          false,
        ),
      ],
      hub: [
        new CalendarEvent(
          'hub-hold',
          `${HOLD_TAG} ${OWN_DOMAIN}`,
          meetingStart,
          meetingEnd,
          false,
          false,
        ),
      ],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.removeHoldPlaceholderReminders).toHaveBeenCalledWith(
      HUB,
      'hub-hold',
    );
    expect(calendarPort.deleteEvent).not.toHaveBeenCalled();
  });

  it('does not remove reminders from a placeholder that reconciliation deletes', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent(
          'stale-hold',
          HOLD_TAG,
          new Date('2020-01-05T00:00:00Z'),
          new Date('2020-01-05T00:30:00Z'),
          false,
          false,
        ),
      ],
      hub: [],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent).toHaveBeenCalledWith(OWN, 'stale-hold');
    expect(calendarPort.removeHoldPlaceholderReminders).not.toHaveBeenCalled();
  });

  it('keeps running after a create fails and throws an error naming the failed item', () => {
    const laterStart = new Date('2020-01-03T10:00:00Z');
    const laterEnd = new Date('2020-01-03T11:00:00Z');
    const { useCase, calendarPort } = createMocks({
      own: [],
      hub: [
        hubMeeting,
        new CalendarEvent(
          'hub-later',
          'Later',
          laterStart,
          laterEnd,
          false,
          false,
        ),
      ],
    });
    calendarPort.createHoldPlaceholder.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });

    expect(() => useCase.execute(NOW, OWN_DOMAIN)).toThrow(
      /2020-01-02T10:00:00\.000Z.*quota exceeded/,
    );
    expect(calendarPort.createHoldPlaceholder).toHaveBeenCalledTimes(2);
  });

  it('names every failed reminder removal and still deletes the other stale placeholder', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent(
          'own-hold',
          HOLD_TAG,
          meetingStart,
          meetingEnd,
          false,
          false,
          false,
        ),
        new CalendarEvent(
          'stale-hold',
          HOLD_TAG,
          new Date('2020-01-05T00:00:00Z'),
          new Date('2020-01-05T00:30:00Z'),
          false,
          false,
          false,
        ),
      ],
      hub: [hubMeeting],
    });
    calendarPort.removeHoldPlaceholderReminders.mockImplementationOnce(() => {
      throw new Error('Service invoked too many times');
    });

    expect(() => useCase.execute(NOW, OWN_DOMAIN)).toThrow(/own-hold/);
    expect(calendarPort.deleteEvent).toHaveBeenCalledWith(OWN, 'stale-hold');
  });

  it('throws when a delete fails and still performs the remaining creates', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        new CalendarEvent(
          'stale-hold',
          HOLD_TAG,
          new Date('2020-01-05T00:00:00Z'),
          new Date('2020-01-05T00:30:00Z'),
          false,
          false,
          true,
        ),
      ],
      hub: [hubMeeting],
    });
    calendarPort.deleteEvent.mockImplementationOnce(() => {
      throw new Error('already deleted');
    });

    expect(() => useCase.execute(NOW, OWN_DOMAIN)).toThrow(/stale-hold/);
    expect(calendarPort.createHoldPlaceholder).toHaveBeenCalledTimes(1);
  });
});
