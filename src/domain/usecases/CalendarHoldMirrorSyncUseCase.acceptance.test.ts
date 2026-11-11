import { CalendarEvent } from '../entities/CalendarEvent';
import { CalendarEventColor } from '../entities/CalendarEventColor';
import { CalendarRef } from '../entities/CalendarRef';
import { HoldPlaceholder } from '../entities/HoldPlaceholder';
import { HOLD_TAG } from '../entities/HoldPlaceholderReconciliation';
import { CalendarPort } from './adapter-interfaces/CalendarPort';
import { ConfigPort } from './adapter-interfaces/ConfigPort';
import { LogPort } from './adapter-interfaces/LogPort';
import { CalendarHoldMirrorSyncUseCase } from './CalendarHoldMirrorSyncUseCase';

const OWN_DOMAIN = 'example.com';
const OTHER_DOMAIN = 'other.example.org';
const HUB_CALENDAR_ID = 'hub-calendar-id';
const NOW = new Date('2020-01-01T00:00:00Z');
const SLOT_START = new Date('2020-01-01T09:00:00Z');
const SLOT_END = new Date('2020-01-01T09:30:00Z');
const SOURCE_TITLE = 'Standup';

const CONFIG: Record<string, string> = {
  HUB_CALENDAR_ID,
  SYNC_DAYS: '90',
  MEETING_OK_TAG: '#meeting-ok',
  MEETING_OK_TITLE: 'Available for meeting',
};

const placeholderTitle = (domain: string, sourceTitle: string): string =>
  `${HOLD_TAG} ${domain} ${sourceTitle}`;

const hubPlaceholder = (
  id: string,
  domain: string,
  sourceTitle: string = SOURCE_TITLE,
): CalendarEvent =>
  new CalendarEvent(
    id,
    placeholderTitle(domain, sourceTitle),
    SLOT_START,
    SLOT_END,
    false,
    false,
  );

const ownSourceEvent = (id: string, title: string = SOURCE_TITLE) =>
  new CalendarEvent(id, title, SLOT_START, SLOT_END, false, false);

class InMemoryCalendarPort implements CalendarPort {
  readonly deletions: { calendar: CalendarRef; eventId: string }[] = [];
  readonly creations: {
    calendar: CalendarRef;
    placeholder: HoldPlaceholder;
  }[] = [];
  readonly colorChanges: {
    calendar: CalendarRef;
    eventId: string;
    color: CalendarEventColor;
  }[] = [];

  constructor(
    private readonly listings: { own: CalendarEvent[]; hub: CalendarEvent[] },
  ) {}

  exists(): boolean {
    return true;
  }

  listTimedEvents(calendar: CalendarRef): CalendarEvent[] {
    return calendar.type === 'own'
      ? [...this.listings.own]
      : [...this.listings.hub];
  }

  createHoldPlaceholder(
    calendar: CalendarRef,
    placeholder: HoldPlaceholder,
  ): void {
    this.creations.push({ calendar, placeholder });
  }

  deleteEvent(calendar: CalendarRef, eventId: string): void {
    this.deletions.push({ calendar, eventId });
  }

  setEventColor(
    calendar: CalendarRef,
    eventId: string,
    color: CalendarEventColor,
  ): void {
    this.colorChanges.push({ calendar, eventId, color });
  }

  deletedIdsOn(calendarType: CalendarRef['type']): string[] {
    return this.deletions
      .filter((deletion) => deletion.calendar.type === calendarType)
      .map((deletion) => deletion.eventId)
      .sort();
  }

  createdTitlesOn(calendarType: CalendarRef['type']): string[] {
    return this.creations
      .filter((creation) => creation.calendar.type === calendarType)
      .map((creation) => creation.placeholder.title);
  }
}

class InMemoryConfigPort implements ConfigPort {
  constructor(private readonly values: Record<string, string>) {}

  getRequired(key: string): string {
    const value = this.values[key];
    if (value === undefined) {
      throw new Error(`Required Script Property "${key}" is not set`);
    }
    return value;
  }
}

class InMemoryLogPort implements LogPort {
  readonly messages: string[] = [];

  error(message: string): void {
    this.messages.push(message);
  }
}

const runSync = (
  listings: { own: CalendarEvent[]; hub: CalendarEvent[] },
  domain: string = OWN_DOMAIN,
) => {
  const calendarPort = new InMemoryCalendarPort(listings);
  const configPort = new InMemoryConfigPort(CONFIG);
  const logPort = new InMemoryLogPort();
  new CalendarHoldMirrorSyncUseCase(calendarPort, configPort, logPort).execute(
    NOW,
    domain,
  );
  return { calendarPort, logPort };
};

describe('CalendarHoldMirrorSyncUseCase acceptance', () => {
  describe('duplicate placeholders whose source event still exists', () => {
    it.each([
      {
        name: 'keeps the single copy with the smallest id and deletes the rest',
        ownEvents: [ownSourceEvent('own-standup')],
        hubEvents: [
          hubPlaceholder('evt-2', OWN_DOMAIN),
          hubPlaceholder('evt-1', OWN_DOMAIN),
        ],
        expectedHubDeletedIds: ['evt-2'],
        expectedHubCreatedTitles: [],
      },
      {
        name: 'keeps the smallest string id among three copies regardless of listing position',
        ownEvents: [ownSourceEvent('own-standup')],
        hubEvents: [
          hubPlaceholder('evt-3', OWN_DOMAIN),
          hubPlaceholder('evt-1', OWN_DOMAIN),
          hubPlaceholder('evt-2', OWN_DOMAIN),
        ],
        expectedHubDeletedIds: ['evt-2', 'evt-3'],
        expectedHubCreatedTitles: [],
      },
    ])(
      '$name',
      ({
        ownEvents,
        hubEvents,
        expectedHubDeletedIds,
        expectedHubCreatedTitles,
      }) => {
        const { calendarPort } = runSync({ own: ownEvents, hub: hubEvents });

        expect({
          hubDeletedIds: calendarPort.deletedIdsOn('hub'),
          hubCreatedTitles: calendarPort.createdTitlesOn('hub'),
        }).toEqual({
          hubDeletedIds: expectedHubDeletedIds,
          hubCreatedTitles: expectedHubCreatedTitles,
        });
      },
    );
  });

  describe('kept copy does not depend on hub listing order', () => {
    const listingOrders: string[][] = [
      ['evt-9', 'evt-10', 'evt-2'],
      ['evt-9', 'evt-2', 'evt-10'],
      ['evt-10', 'evt-9', 'evt-2'],
      ['evt-10', 'evt-2', 'evt-9'],
      ['evt-2', 'evt-9', 'evt-10'],
      ['evt-2', 'evt-10', 'evt-9'],
    ];

    it.each(
      listingOrders.map((order) => ({
        name: `keeps evt-10 when the hub lists the copies as ${order.join(', ')}`,
        order,
      })),
    )('$name', ({ order }) => {
      const hubEvents = order.map((id) => hubPlaceholder(id, OWN_DOMAIN));
      const { calendarPort } = runSync({
        own: [ownSourceEvent('own-standup')],
        hub: hubEvents,
      });

      const deletedIds = calendarPort.deletedIdsOn('hub');
      const keptIds = order.filter((id) => !deletedIds.includes(id));

      expect({ deletedIds, keptIds }).toEqual({
        deletedIds: ['evt-2', 'evt-9'],
        keptIds: ['evt-10'],
      });
    });
  });

  describe('duplicate placeholders whose source event no longer exists', () => {
    it.each([
      {
        name: 'deletes every copy when the own calendar has no source event',
        ownEvents: [],
        hubEvents: [
          hubPlaceholder('evt-1', OWN_DOMAIN),
          hubPlaceholder('evt-2', OWN_DOMAIN),
        ],
        expectedHubDeletedIds: ['evt-1', 'evt-2'],
      },
      {
        name: 'deletes every copy when the own calendar only holds an unrelated event',
        ownEvents: [ownSourceEvent('own-lunch', 'Lunch')],
        hubEvents: [
          hubPlaceholder('evt-1', OWN_DOMAIN),
          hubPlaceholder('evt-2', OWN_DOMAIN),
          hubPlaceholder('evt-3', OWN_DOMAIN),
        ],
        expectedHubDeletedIds: ['evt-1', 'evt-2', 'evt-3'],
      },
    ])('$name', ({ ownEvents, hubEvents, expectedHubDeletedIds }) => {
      const { calendarPort } = runSync({ own: ownEvents, hub: hubEvents });

      expect(calendarPort.deletedIdsOn('hub')).toEqual(expectedHubDeletedIds);
    });
  });

  describe('placeholders of another account on the hub', () => {
    it.each([
      {
        name: 'does not delete duplicated placeholders of another account when the own source is absent',
        ownEvents: [],
        hubEvents: [
          hubPlaceholder('other-1', OTHER_DOMAIN),
          hubPlaceholder('other-2', OTHER_DOMAIN),
        ],
        expectedHubDeletedIds: [],
      },
      {
        name: 'does not delete duplicated placeholders of another account when the own source exists',
        ownEvents: [ownSourceEvent('own-standup')],
        hubEvents: [
          hubPlaceholder('other-1', OTHER_DOMAIN),
          hubPlaceholder('other-2', OTHER_DOMAIN),
        ],
        expectedHubDeletedIds: [],
      },
      {
        name: 'deletes only this account duplicates and leaves duplicated placeholders of another account',
        ownEvents: [ownSourceEvent('own-standup')],
        hubEvents: [
          hubPlaceholder('evt-1', OWN_DOMAIN),
          hubPlaceholder('evt-2', OWN_DOMAIN),
          hubPlaceholder('other-1', OTHER_DOMAIN),
          hubPlaceholder('other-2', OTHER_DOMAIN),
        ],
        expectedHubDeletedIds: ['evt-2'],
      },
    ])('$name', ({ ownEvents, hubEvents, expectedHubDeletedIds }) => {
      const { calendarPort } = runSync({ own: ownEvents, hub: hubEvents });

      expect(calendarPort.deletedIdsOn('hub')).toEqual(expectedHubDeletedIds);
    });
  });

  describe('pull side with duplicated HOLD placeholders on the own calendar', () => {
    it('deletes neither duplicate and creates no placeholder on the own calendar when the hub event still exists', () => {
      const hubEvent = new CalendarEvent(
        'hub-external',
        'External Sync',
        SLOT_START,
        SLOT_END,
        false,
        false,
      );
      const ownHolds = [
        new CalendarEvent(
          'own-hold-a',
          HOLD_TAG,
          SLOT_START,
          SLOT_END,
          false,
          false,
        ),
        new CalendarEvent(
          'own-hold-b',
          HOLD_TAG,
          SLOT_START,
          SLOT_END,
          false,
          false,
        ),
      ];
      const { calendarPort } = runSync({ own: ownHolds, hub: [hubEvent] });

      expect({
        ownDeletedIds: calendarPort.deletedIdsOn('own'),
        ownCreatedTitles: calendarPort.createdTitlesOn('own'),
      }).toEqual({
        ownDeletedIds: [],
        ownCreatedTitles: [],
      });
    });
  });
});
