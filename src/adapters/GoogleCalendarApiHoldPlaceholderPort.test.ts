import { CalendarRef } from '../domain/entities/CalendarRef';
import { HoldPlaceholder } from '../domain/entities/HoldPlaceholder';
import {
  GoogleCalendarApiHoldPlaceholderPort,
  hasInvalidReminders,
} from './GoogleCalendarApiHoldPlaceholderPort';

type Reminders = Parameters<typeof hasInvalidReminders>[0];

const OWN: CalendarRef = { type: 'own' };
const HUB: CalendarRef = { type: 'hub', hubCalendarId: 'hub-calendar-id' };
const FROM = new Date('2020-01-01T00:00:00Z');
const TO = new Date('2020-04-01T00:00:00Z');
const START = new Date('2020-01-02T10:00:00Z');
const END = new Date('2020-01-02T10:30:00Z');
const LIST_FIELDS = 'items(iCalUID,reminders),nextPageToken';

const installCalendarService = (events: {
  list?: jest.Mock;
  insert?: jest.Mock;
}): void => {
  (globalThis as unknown as Record<string, unknown>).Calendar = {
    Events: {
      list: events.list ?? jest.fn(),
      insert: events.insert ?? jest.fn(),
    },
  };
};

describe('hasInvalidReminders', () => {
  const cases: { name: string; reminders: Reminders; expected: boolean }[] = [
    {
      name: 'a missing reminders object',
      reminders: undefined,
      expected: true,
    },
    {
      name: 'useDefault true',
      reminders: { useDefault: true },
      expected: true,
    },
    {
      name: 'useDefault false with a popup override',
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 10 }],
      },
      expected: true,
    },
    {
      name: 'useDefault false with empty overrides',
      reminders: { useDefault: false, overrides: [] },
      expected: false,
    },
    {
      name: 'useDefault false without overrides',
      reminders: { useDefault: false },
      expected: false,
    },
  ];

  it.each(cases)('returns $expected for $name', ({ reminders, expected }) => {
    expect(hasInvalidReminders(reminders)).toBe(expected);
  });
});

describe('GoogleCalendarApiHoldPlaceholderPort', () => {
  describe('listICalUidsWithInvalidReminders', () => {
    it('requests the window with singleEvents and the reminder fields, and sends no pageToken on the first call', () => {
      const list = jest.fn(
        (_calendarId: string, _options: Record<string, unknown>) => ({
          items: [],
        }),
      );
      installCalendarService({ list });
      const port = new GoogleCalendarApiHoldPlaceholderPort();

      port.listICalUidsWithInvalidReminders(OWN, FROM, TO);

      expect(list).toHaveBeenCalledTimes(1);
      const [calendarId, options] = list.mock.calls[0];
      expect(calendarId).toBe('primary');
      expect(options).toEqual({
        timeMin: FROM.toISOString(),
        timeMax: TO.toISOString(),
        singleEvents: true,
        fields: LIST_FIELDS,
      });
      expect(options).not.toHaveProperty('pageToken');
    });

    it.each([
      { name: 'the own calendar', calendar: OWN, calendarId: 'primary' },
      {
        name: 'the hub calendar',
        calendar: HUB,
        calendarId: 'hub-calendar-id',
      },
    ])(
      'lists $name under its calendar id',
      ({ calendar, calendarId: expectedCalendarId }) => {
        const list = jest.fn(
          (_calendarId: string, _options: Record<string, unknown>) => ({
            items: [],
          }),
        );
        installCalendarService({ list });
        const port = new GoogleCalendarApiHoldPlaceholderPort();

        port.listICalUidsWithInvalidReminders(calendar, FROM, TO);

        expect(list.mock.calls[0][0]).toBe(expectedCalendarId);
      },
    );

    it('follows nextPageToken across pages and returns the iCalUID of every invalid event in encounter order', () => {
      const list = jest.fn(
        (_calendarId: string, options: Record<string, unknown>) =>
          options.pageToken === undefined
            ? {
                items: [
                  { iCalUID: 'ical-1', reminders: { useDefault: true } },
                  {
                    iCalUID: 'ical-2',
                    reminders: { useDefault: false, overrides: [] },
                  },
                ],
                nextPageToken: 'page-2',
              }
            : {
                items: [
                  { iCalUID: 'ical-3', reminders: undefined },
                  {
                    iCalUID: 'ical-4',
                    reminders: {
                      useDefault: false,
                      overrides: [{ method: 'popup', minutes: 10 }],
                    },
                  },
                ],
              },
      );
      installCalendarService({ list });
      const port = new GoogleCalendarApiHoldPlaceholderPort();

      const ids = port.listICalUidsWithInvalidReminders(OWN, FROM, TO);

      expect(ids).toEqual(['ical-1', 'ical-3', 'ical-4']);
      expect(list).toHaveBeenCalledTimes(2);
      expect(list.mock.calls[1][1]).toEqual({
        timeMin: FROM.toISOString(),
        timeMax: TO.toISOString(),
        singleEvents: true,
        fields: LIST_FIELDS,
        pageToken: 'page-2',
      });
    });

    it('returns an empty list when no event has invalid reminders', () => {
      const list = jest.fn(
        (_calendarId: string, _options: Record<string, unknown>) => ({
          items: [
            {
              iCalUID: 'ical-valid',
              reminders: { useDefault: false, overrides: [] },
            },
          ],
        }),
      );
      installCalendarService({ list });
      const port = new GoogleCalendarApiHoldPlaceholderPort();

      expect(port.listICalUidsWithInvalidReminders(OWN, FROM, TO)).toEqual([]);
    });

    it('throws when a listed event has no iCalUID', () => {
      const list = jest.fn(
        (_calendarId: string, _options: Record<string, unknown>) => ({
          items: [{ reminders: { useDefault: true } }],
        }),
      );
      installCalendarService({ list });
      const port = new GoogleCalendarApiHoldPlaceholderPort();

      expect(() =>
        port.listICalUidsWithInvalidReminders(OWN, FROM, TO),
      ).toThrow(Error);
    });

    it('propagates an error thrown by Calendar.Events.list unchanged', () => {
      const listError = new Error('Calendar API quota exceeded');
      const list = jest.fn(
        (_calendarId: string, _options: Record<string, unknown>) => {
          throw listError;
        },
      );
      installCalendarService({ list });
      const port = new GoogleCalendarApiHoldPlaceholderPort();

      expect(() =>
        port.listICalUidsWithInvalidReminders(OWN, FROM, TO),
      ).toThrow(listError);
    });
  });

  describe('createHoldPlaceholder', () => {
    it.each([
      { name: 'the own calendar', calendar: OWN, calendarId: 'primary' },
      {
        name: 'the hub calendar',
        calendar: HUB,
        calendarId: 'hub-calendar-id',
      },
    ])(
      'inserts an atomic placeholder body with reminders disabled on $name',
      ({ calendar, calendarId: expectedCalendarId }) => {
        const insert = jest.fn(
          (_body: Record<string, unknown>, _calendarId: string) => ({}),
        );
        installCalendarService({ insert });
        const port = new GoogleCalendarApiHoldPlaceholderPort();

        port.createHoldPlaceholder(
          calendar,
          new HoldPlaceholder('[HOLD] example.com', START, END),
        );

        expect(insert.mock.calls).toEqual([
          [
            {
              summary: '[HOLD] example.com',
              start: { dateTime: '2020-01-02T10:00:00.000Z' },
              end: { dateTime: '2020-01-02T10:30:00.000Z' },
              reminders: { useDefault: false, overrides: [] },
              transparency: 'opaque',
            },
            expectedCalendarId,
          ],
        ]);
      },
    );

    it('propagates an error thrown by Calendar.Events.insert unchanged', () => {
      const insertError = new Error('Calendar API backend error');
      const insert = jest.fn(
        (_body: Record<string, unknown>, _calendarId: string) => {
          throw insertError;
        },
      );
      installCalendarService({ insert });
      const port = new GoogleCalendarApiHoldPlaceholderPort();

      expect(() =>
        port.createHoldPlaceholder(
          OWN,
          new HoldPlaceholder('[HOLD]', START, END),
        ),
      ).toThrow(insertError);
    });
  });
});

describe('GoogleCalendarApiHoldPlaceholderPort without the advanced Calendar service', () => {
  let hadCalendar = false;
  let savedCalendar: unknown;

  beforeEach(() => {
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    hadCalendar = 'Calendar' in globalRecord;
    savedCalendar = globalRecord.Calendar;
    delete globalRecord.Calendar;
  });

  afterEach(() => {
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    if (hadCalendar) {
      globalRecord.Calendar = savedCalendar;
    } else {
      delete globalRecord.Calendar;
    }
  });

  it.each([
    {
      name: 'listICalUidsWithInvalidReminders',
      call: (port: GoogleCalendarApiHoldPlaceholderPort): unknown =>
        port.listICalUidsWithInvalidReminders(OWN, FROM, TO),
    },
    {
      name: 'createHoldPlaceholder',
      call: (port: GoogleCalendarApiHoldPlaceholderPort): unknown =>
        port.createHoldPlaceholder(
          OWN,
          new HoldPlaceholder('[HOLD]', START, END),
        ),
    },
  ])(
    '$name throws an Error naming the advanced Calendar service instead of a ReferenceError',
    ({ call }) => {
      const port = new GoogleCalendarApiHoldPlaceholderPort();
      let caught: unknown;

      try {
        call(port);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(ReferenceError);
      expect((caught as Error).message).toContain('advanced Calendar service');
    },
  );
});
