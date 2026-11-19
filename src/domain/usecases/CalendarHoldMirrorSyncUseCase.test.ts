import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import { HOLD_TAG } from '../entities/HoldPlaceholderReconciliation';
import { CalendarHoldMirrorSyncUseCase } from './CalendarHoldMirrorSyncUseCase';

const OWN_DOMAIN = 'example.com';
const HUB_CALENDAR_ID = 'hub-calendar-id';
const NOW = new Date('2020-01-01T00:00:00Z');
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SYNC_DAYS = 90;
const WINDOW_END = new Date(NOW.getTime() + SYNC_DAYS * MILLISECONDS_PER_DAY);
const OWN: CalendarRef = { type: 'own' };
const HUB: CalendarRef = { type: 'hub', hubCalendarId: HUB_CALENDAR_ID };

const START = new Date('2020-01-01T09:00:00Z');
const END = new Date('2020-01-01T09:30:00Z');
const MEETING_START = new Date('2020-01-02T10:00:00Z');
const MEETING_END = new Date('2020-01-02T11:00:00Z');
const STALE_START = new Date('2020-01-05T00:00:00Z');
const STALE_END = new Date('2020-01-05T00:30:00Z');

const CONFIG: Record<string, string> = {
  HUB_CALENDAR_ID,
  SYNC_DAYS: String(SYNC_DAYS),
  MEETING_OK_TAG: '#meeting-ok',
  MEETING_OK_TITLE: 'Available for meeting',
};

type InvalidReminderIds = { own: string[]; hub: string[] };

const event = (
  id: string,
  title: string,
  startAt: Date,
  endAt: Date,
): CalendarEvent => new CalendarEvent(id, title, startAt, endAt, false, false);

const createMocks = (
  eventsByCalendar: { own: CalendarEvent[]; hub: CalendarEvent[] },
  overrides: {
    config?: Record<string, string>;
    invalidIds?: InvalidReminderIds;
  } = {},
) => {
  const config = overrides.config ?? CONFIG;
  const invalidIds = overrides.invalidIds ?? { own: [], hub: [] };
  const calendarPort = {
    exists: jest.fn((_calendar: CalendarRef): boolean => true),
    listTimedEvents: jest.fn(
      (calendar: CalendarRef, _from: Date, _to: Date): CalendarEvent[] =>
        calendar.type === 'own' ? eventsByCalendar.own : eventsByCalendar.hub,
    ),
    deleteEvent: jest.fn(
      (_calendar: CalendarRef, _eventId: string): void => {},
    ),
    setEventColor: jest.fn(
      (_calendar: CalendarRef, _eventId: string, _color: string): void => {},
    ),
  };
  const holdPlaceholderPort = {
    listEventIdsWithInvalidReminders: jest.fn(
      (calendar: CalendarRef, _from: Date, _to: Date): string[] =>
        calendar.type === 'own' ? invalidIds.own : invalidIds.hub,
    ),
    createHoldPlaceholder: jest.fn(
      (_calendar: CalendarRef, _placeholder: HoldPlaceholder): void => {},
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
    holdPlaceholderPort,
    configPort,
    logPort,
  );
  return { useCase, calendarPort, holdPlaceholderPort, configPort, logPort };
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

      const { useCase, calendarPort, holdPlaceholderPort, logPort } =
        createMocks({
          own: [
            event('own-standup', 'Standup', standupStart, standupEnd),
            event('own-hold-stale', HOLD_TAG, staleHoldStart, staleHoldEnd),
          ],
          hub: [
            event('hub-external', 'External Sync', externalStart, externalEnd),
            event(
              'hub-oldtitle',
              `${HOLD_TAG} ${OWN_DOMAIN} OldTitle`,
              stalePushStart,
              stalePushEnd,
            ),
          ],
        });

      useCase.execute(NOW, OWN_DOMAIN);

      expect(calendarPort.deleteEvent.mock.calls).toEqual([
        [HUB, 'hub-oldtitle'],
        [OWN, 'own-hold-stale'],
      ]);
      expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([
        [
          HUB,
          new HoldPlaceholder(
            `${HOLD_TAG} ${OWN_DOMAIN}`,
            standupStart,
            standupEnd,
          ),
        ],
        [OWN, new HoldPlaceholder(HOLD_TAG, externalStart, externalEnd)],
      ]);
      expect(logPort.error.mock.calls).toEqual([]);
    });

    it('logs and performs no calendar mutations or listings when a required config value is missing', () => {
      const { useCase, calendarPort, holdPlaceholderPort, logPort } =
        createMocks(
          { own: [], hub: [] },
          {
            config: {
              SYNC_DAYS: '90',
              MEETING_OK_TAG: '#meeting-ok',
              MEETING_OK_TITLE: 'x',
            },
          },
        );

      useCase.execute(NOW, OWN_DOMAIN);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(
        holdPlaceholderPort.listEventIdsWithInvalidReminders.mock.calls,
      ).toEqual([]);
      expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and performs no calendar mutations or listings when SYNC_DAYS is not a positive integer', () => {
      const { useCase, calendarPort, holdPlaceholderPort, logPort } =
        createMocks(
          { own: [], hub: [] },
          { config: { ...CONFIG, SYNC_DAYS: 'abc' } },
        );

      useCase.execute(NOW, OWN_DOMAIN);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(
        holdPlaceholderPort.listEventIdsWithInvalidReminders.mock.calls,
      ).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('logs and performs no calendar mutations or listings when the hub calendar is not accessible', () => {
      const { useCase, calendarPort, holdPlaceholderPort, logPort } =
        createMocks({ own: [], hub: [] });
      calendarPort.exists.mockReturnValue(false);

      useCase.execute(NOW, OWN_DOMAIN);

      expect(calendarPort.listTimedEvents.mock.calls).toEqual([]);
      expect(
        holdPlaceholderPort.listEventIdsWithInvalidReminders.mock.calls,
      ).toEqual([]);
      expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([]);
      expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
      expect(logPort.error.mock.calls.length).toBe(1);
    });

    it('enumerates each calendar exactly once per run', () => {
      const { useCase, calendarPort } = createMocks({
        own: [event('own-event', 'Own meeting', START, END)],
        hub: [event('hub-event', 'Hub meeting', START, END)],
      });

      useCase.execute(NOW, OWN_DOMAIN);

      const enumeratedCalendarTypes =
        calendarPort.listTimedEvents.mock.calls.map(
          ([calendar]: [CalendarRef, Date, Date]) => calendar.type,
        );
      expect(enumeratedCalendarTypes.sort()).toEqual(['hub', 'own']);
    });

    it('does not push a hold placeholder for an own event already present as a direct non-hold invite on the hub at the exact same time', () => {
      const { useCase, holdPlaceholderPort } = createMocks({
        own: [event('own-meeting', 'Weekly scrum planning', START, END)],
        hub: [event('hub-direct-invite', 'Weekly scrum planning', START, END)],
      });

      useCase.execute(NOW, OWN_DOMAIN);

      const pushedToHubCalls =
        holdPlaceholderPort.createHoldPlaceholder.mock.calls.filter(
          ([calendar]: [CalendarRef, HoldPlaceholder]) =>
            calendar.type === 'hub',
        );
      expect(pushedToHubCalls).toEqual([]);
    });
  });
});

describe('CalendarHoldMirrorSyncUseCase hold placeholder duplicates', () => {
  it('deletes every copy of a duplicated hub placeholder but one, and creates none, when the key is desired', () => {
    const { useCase, calendarPort, holdPlaceholderPort } = createMocks({
      own: [event('own-standup', 'Standup', START, END)],
      hub: [
        event('hub-placeholder-b', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
        event('hub-placeholder-a', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
      ],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([
      [HUB, 'hub-placeholder-b'],
    ]);
    expect(
      holdPlaceholderPort.createHoldPlaceholder.mock.calls.filter(
        ([calendar]: [CalendarRef, HoldPlaceholder]) => calendar.type === 'hub',
      ),
    ).toEqual([]);
  });

  it('keeps every own hold placeholder whose key is desired on the pull side', () => {
    const { useCase, calendarPort, holdPlaceholderPort } = createMocks({
      own: [
        event('own-hold-a', HOLD_TAG, START, END),
        event('own-hold-b', HOLD_TAG, START, END),
      ],
      hub: [event('hub-external', 'External Sync', START, END)],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([]);
  });

  it('deletes every own hold placeholder whose key is no longer desired on the pull side', () => {
    const { useCase, calendarPort } = createMocks({
      own: [
        event('own-hold-a', HOLD_TAG, START, END),
        event('own-hold-b', HOLD_TAG, START, END),
      ],
      hub: [],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([
      [OWN, 'own-hold-a'],
      [OWN, 'own-hold-b'],
    ]);
  });

  it('deletes every copy of a stale hub placeholder whose key is no longer desired', () => {
    const { useCase, calendarPort } = createMocks({
      own: [],
      hub: [
        event(
          'hub-placeholder-a',
          `${HOLD_TAG} ${OWN_DOMAIN} Gone`,
          START,
          END,
        ),
        event(
          'hub-placeholder-b',
          `${HOLD_TAG} ${OWN_DOMAIN} Gone`,
          START,
          END,
        ),
      ],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([
      [HUB, 'hub-placeholder-a'],
      [HUB, 'hub-placeholder-b'],
    ]);
  });
});

describe('CalendarHoldMirrorSyncUseCase invalid reminders on managed placeholders', () => {
  it('requests the reminder listing for the own and the hub calendar over the sync window', () => {
    const { useCase, holdPlaceholderPort } = createMocks({ own: [], hub: [] });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(
      holdPlaceholderPort.listEventIdsWithInvalidReminders.mock.calls,
    ).toEqual(
      expect.arrayContaining([
        [OWN, NOW, WINDOW_END],
        [HUB, NOW, WINDOW_END],
      ]),
    );
    expect(
      holdPlaceholderPort.listEventIdsWithInvalidReminders.mock.calls,
    ).toHaveLength(2);
  });

  it('deletes nothing and creates nothing when no managed placeholder has invalid reminders', () => {
    const { useCase, calendarPort, holdPlaceholderPort } = createMocks({
      own: [
        event('own-standup', 'Standup', START, END),
        event('own-hold', HOLD_TAG, MEETING_START, MEETING_END),
      ],
      hub: [
        event('hub-placeholder', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
        event('hub-external', 'External Sync', MEETING_START, MEETING_END),
      ],
    });

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([]);
  });

  it.each([
    {
      name: 'recreates an invalid kept own pull placeholder with the same title, start and end',
      ownEvents: [event('own-hold', HOLD_TAG, MEETING_START, MEETING_END)],
      hubEvents: [
        event('hub-external', 'External Sync', MEETING_START, MEETING_END),
      ],
      invalidIds: { own: ['own-hold'], hub: [] },
      expectedDeletes: [[OWN, 'own-hold']],
      expectedCreates: [
        [OWN, new HoldPlaceholder(HOLD_TAG, MEETING_START, MEETING_END)],
      ],
    },
    {
      name: 'recreates an invalid kept hub push placeholder with the same title, start and end',
      ownEvents: [event('own-standup', 'Standup', START, END)],
      hubEvents: [
        event('hub-placeholder', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
      ],
      invalidIds: { own: [], hub: ['hub-placeholder'] },
      expectedDeletes: [[HUB, 'hub-placeholder']],
      expectedCreates: [
        [HUB, new HoldPlaceholder(`${HOLD_TAG} ${OWN_DOMAIN}`, START, END)],
      ],
    },
  ])(
    '$name',
    ({
      ownEvents,
      hubEvents,
      invalidIds,
      expectedDeletes,
      expectedCreates,
    }) => {
      const { useCase, calendarPort, holdPlaceholderPort } = createMocks(
        { own: ownEvents, hub: hubEvents },
        { invalidIds },
      );

      useCase.execute(NOW, OWN_DOMAIN);

      expect(calendarPort.deleteEvent.mock.calls).toEqual(expectedDeletes);
      expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual(
        expectedCreates,
      );
    },
  );

  it('deletes an invalid placeholder before creating its replacement', () => {
    const { useCase, calendarPort, holdPlaceholderPort } = createMocks(
      {
        own: [event('own-hold', HOLD_TAG, MEETING_START, MEETING_END)],
        hub: [
          event('hub-external', 'External Sync', MEETING_START, MEETING_END),
        ],
      },
      { invalidIds: { own: ['own-hold'], hub: [] } },
    );

    useCase.execute(NOW, OWN_DOMAIN);

    const deleteOrder = calendarPort.deleteEvent.mock.invocationCallOrder[0];
    const createOrder =
      holdPlaceholderPort.createHoldPlaceholder.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it.each([
    {
      name: 'deletes an invalid placeholder that is already deleted as stale, and does not recreate it',
      ownEvents: [event('own-hold-stale', HOLD_TAG, STALE_START, STALE_END)],
      hubEvents: [],
      invalidIds: { own: ['own-hold-stale'], hub: [] },
      expectedDeletes: [[OWN, 'own-hold-stale']],
    },
    {
      name: 'deletes an invalid duplicate hub placeholder once, and does not recreate it',
      ownEvents: [event('own-standup', 'Standup', START, END)],
      hubEvents: [
        event('hub-placeholder-a', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
        event('hub-placeholder-b', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
      ],
      invalidIds: { own: [], hub: ['hub-placeholder-b'] },
      expectedDeletes: [[HUB, 'hub-placeholder-b']],
    },
  ])('$name', ({ ownEvents, hubEvents, invalidIds, expectedDeletes }) => {
    const { useCase, calendarPort, holdPlaceholderPort } = createMocks(
      { own: ownEvents, hub: hubEvents },
      { invalidIds },
    );

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual(expectedDeletes);
    expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([]);
  });

  it('leaves valid managed placeholders and invalid events that are not managed untouched', () => {
    const { useCase, calendarPort, holdPlaceholderPort } = createMocks(
      {
        own: [
          event('own-standup', 'Standup', START, END),
          event('own-hold', HOLD_TAG, MEETING_START, MEETING_END),
        ],
        hub: [
          event('hub-placeholder', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
          event('hub-external', 'External Sync', MEETING_START, MEETING_END),
        ],
      },
      { invalidIds: { own: ['unrelated-own'], hub: ['hub-external'] } },
    );

    useCase.execute(NOW, OWN_DOMAIN);

    expect(calendarPort.deleteEvent.mock.calls).toEqual([]);
    expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([]);
  });

  it('does not delete or recreate an invalid placeholder whose delete for recreation fails, and still processes the other items', () => {
    const { useCase, calendarPort, holdPlaceholderPort } = createMocks(
      {
        own: [
          event('own-standup', 'Standup', START, END),
          event('own-hold', HOLD_TAG, MEETING_START, MEETING_END),
        ],
        hub: [
          event('hub-placeholder', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
          event('hub-external', 'External Sync', MEETING_START, MEETING_END),
        ],
      },
      { invalidIds: { own: ['own-hold'], hub: ['hub-placeholder'] } },
    );
    calendarPort.deleteEvent.mockImplementation(
      (_calendar: CalendarRef, eventId: string): void => {
        if (eventId === 'own-hold') {
          throw new Error('delete failed');
        }
      },
    );

    expect(() => useCase.execute(NOW, OWN_DOMAIN)).toThrow(/own-hold/);
    expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([
      [HUB, new HoldPlaceholder(`${HOLD_TAG} ${OWN_DOMAIN}`, START, END)],
    ]);
    expect(calendarPort.deleteEvent.mock.calls).toEqual([
      [HUB, 'hub-placeholder'],
      [OWN, 'own-hold'],
    ]);
  });

  it('collects a failed recreation create, still performs the other creates, and throws an error naming the failed placeholder', () => {
    const { useCase, holdPlaceholderPort } = createMocks(
      {
        own: [
          event('own-standup', 'Standup', START, END),
          event('own-hold', HOLD_TAG, MEETING_START, MEETING_END),
        ],
        hub: [
          event('hub-placeholder', `${HOLD_TAG} ${OWN_DOMAIN}`, START, END),
          event('hub-external', 'External Sync', MEETING_START, MEETING_END),
        ],
      },
      { invalidIds: { own: ['own-hold'], hub: ['hub-placeholder'] } },
    );
    holdPlaceholderPort.createHoldPlaceholder.mockImplementation(
      (_calendar: CalendarRef, placeholder: HoldPlaceholder): void => {
        if (placeholder.startAt.getTime() === MEETING_START.getTime()) {
          throw new Error('quota exceeded');
        }
      },
    );

    expect(() => useCase.execute(NOW, OWN_DOMAIN)).toThrow(
      /2020-01-02T10:00:00\.000Z.*quota exceeded/,
    );
    expect(holdPlaceholderPort.createHoldPlaceholder.mock.calls).toEqual([
      [HUB, new HoldPlaceholder(`${HOLD_TAG} ${OWN_DOMAIN}`, START, END)],
      [OWN, new HoldPlaceholder(HOLD_TAG, MEETING_START, MEETING_END)],
    ]);
  });

  it('keeps running after a desired create fails and throws an error naming the failed item', () => {
    const laterStart = new Date('2020-01-03T10:00:00Z');
    const laterEnd = new Date('2020-01-03T11:00:00Z');
    const { useCase, holdPlaceholderPort } = createMocks({
      own: [
        event('own-standup', 'Standup', START, END),
        event('own-later', 'Later', laterStart, laterEnd),
      ],
      hub: [],
    });
    holdPlaceholderPort.createHoldPlaceholder.mockImplementation(
      (_calendar: CalendarRef, placeholder: HoldPlaceholder): void => {
        if (placeholder.startAt.getTime() === START.getTime()) {
          throw new Error('quota exceeded');
        }
      },
    );

    expect(() => useCase.execute(NOW, OWN_DOMAIN)).toThrow(
      /2020-01-01T09:00:00\.000Z.*quota exceeded/,
    );
    expect(holdPlaceholderPort.createHoldPlaceholder).toHaveBeenCalledTimes(2);
  });

  it('throws when a reconciliation delete fails and still performs the remaining creates', () => {
    const { useCase, calendarPort, holdPlaceholderPort } = createMocks({
      own: [event('stale-hold', HOLD_TAG, STALE_START, STALE_END)],
      hub: [event('hub-external', 'External Sync', MEETING_START, MEETING_END)],
    });
    calendarPort.deleteEvent.mockImplementationOnce(() => {
      throw new Error('already deleted');
    });

    expect(() => useCase.execute(NOW, OWN_DOMAIN)).toThrow(/stale-hold/);
    expect(holdPlaceholderPort.createHoldPlaceholder).toHaveBeenCalledTimes(1);
  });
});
