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

const holdTitle = (domain: string): string => `${HOLD_TAG} ${domain}`;

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

const hubPlaceholderTitled = (id: string, title: string): CalendarEvent =>
  new CalendarEvent(id, title, SLOT_START, SLOT_END, false, false);

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
          hubPlaceholderTitled('evt-2', holdTitle(OWN_DOMAIN)),
          hubPlaceholderTitled('evt-1', holdTitle(OWN_DOMAIN)),
        ],
        expectedHubDeletedIds: ['evt-2'],
        expectedHubCreatedTitles: [],
      },
      {
        name: 'keeps the smallest string id among three copies regardless of listing position',
        ownEvents: [ownSourceEvent('own-standup')],
        hubEvents: [
          hubPlaceholderTitled('evt-3', holdTitle(OWN_DOMAIN)),
          hubPlaceholderTitled('evt-1', holdTitle(OWN_DOMAIN)),
          hubPlaceholderTitled('evt-2', holdTitle(OWN_DOMAIN)),
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
      const hubEvents = order.map((id) =>
        hubPlaceholderTitled(id, holdTitle(OWN_DOMAIN)),
      );
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
          hubPlaceholderTitled('evt-1', holdTitle(OWN_DOMAIN)),
          hubPlaceholderTitled('evt-2', holdTitle(OWN_DOMAIN)),
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

  describe('title privacy of new-format placeholders', () => {
    it('collapses two own events with different titles at the same time into one hub placeholder titled with the hold tag and domain', () => {
      const { calendarPort } = runSync({
        own: [
          ownSourceEvent('own-standup', 'Standup'),
          ownSourceEvent('own-review', 'Weekly scrum planning'),
        ],
        hub: [],
      });

      expect(calendarPort.createdTitlesOn('hub')).toEqual([
        holdTitle(OWN_DOMAIN),
      ]);
    });

    it('creates and deletes nothing for a hub placeholder already titled with the hold tag and domain at the same time range', () => {
      const { calendarPort } = runSync({
        own: [ownSourceEvent('own-standup')],
        hub: [hubPlaceholderTitled('evt-1', holdTitle(OWN_DOMAIN))],
      });

      expect({
        hubDeletedIds: calendarPort.deletedIdsOn('hub'),
        hubCreatedTitles: calendarPort.createdTitlesOn('hub'),
        ownDeletedIds: calendarPort.deletedIdsOn('own'),
        ownCreatedTitles: calendarPort.createdTitlesOn('own'),
      }).toEqual({
        hubDeletedIds: [],
        hubCreatedTitles: [],
        ownDeletedIds: [],
        ownCreatedTitles: [],
      });
    });
  });

  describe('migration of legacy placeholders whose source event still exists', () => {
    it.each([
      {
        name: 'replaces a legacy placeholder whose source title is a plain word',
        sourceTitle: 'Standup',
      },
      {
        name: 'replaces a legacy placeholder whose source title contains spaces',
        sourceTitle: 'Weekly scrum planning',
      },
      {
        name: 'replaces a legacy placeholder whose source title contains #',
        sourceTitle: 'Client #42 review',
      },
    ])('$name', ({ sourceTitle }) => {
      const { calendarPort } = runSync({
        own: [ownSourceEvent('own-meeting', sourceTitle)],
        hub: [hubPlaceholder('legacy-1', OWN_DOMAIN, sourceTitle)],
      });

      expect({
        hubDeletedIds: calendarPort.deletedIdsOn('hub'),
        hubCreatedTitles: calendarPort.createdTitlesOn('hub'),
      }).toEqual({
        hubDeletedIds: ['legacy-1'],
        hubCreatedTitles: [holdTitle(OWN_DOMAIN)],
      });
    });
  });

  describe('migration of orphan legacy placeholders', () => {
    it('deletes a legacy placeholder whose source event no longer exists by id and creates nothing for it', () => {
      const { calendarPort } = runSync({
        own: [],
        hub: [hubPlaceholder('legacy-gone', OWN_DOMAIN, 'Gone')],
      });

      expect({
        hubDeletedIds: calendarPort.deletedIdsOn('hub'),
        hubCreatedTitles: calendarPort.createdTitlesOn('hub'),
      }).toEqual({
        hubDeletedIds: ['legacy-gone'],
        hubCreatedTitles: [],
      });
    });
  });

  describe('legacy duplicates with different titles at the same time range', () => {
    it.each([
      {
        name: 'two legacy titles where the own event matches the first',
        ownTitle: 'Standup',
        legacyTitles: ['Standup', 'Weekly scrum planning'],
      },
      {
        name: 'two legacy titles where the own event matches the second',
        ownTitle: 'Lunch',
        legacyTitles: ['Client #42 review', 'Lunch'],
      },
    ])('$name', ({ ownTitle, legacyTitles }) => {
      const { calendarPort } = runSync({
        own: [ownSourceEvent('own-meeting', ownTitle)],
        hub: legacyTitles.map((sourceTitle, index) =>
          hubPlaceholder(`legacy-${index + 1}`, OWN_DOMAIN, sourceTitle),
        ),
      });

      expect({
        hubDeletedIds: calendarPort.deletedIdsOn('hub'),
        hubCreatedTitles: calendarPort.createdTitlesOn('hub'),
      }).toEqual({
        hubDeletedIds: legacyTitles.map((_, index) => `legacy-${index + 1}`),
        hubCreatedTitles: [holdTitle(OWN_DOMAIN)],
      });
    });
  });

  describe('pull direction for new-format and other-domain holds', () => {
    it.each([
      {
        name: 'does not mirror the own domain new-format placeholder back to the own calendar',
        hubTitle: holdTitle(OWN_DOMAIN),
        expectedOwnCreatedTitles: [],
      },
      {
        name: 'mirrors another domain hold as a plain hold',
        hubTitle: `${HOLD_TAG} other.com Standup`,
        expectedOwnCreatedTitles: [HOLD_TAG],
      },
    ])('$name', ({ hubTitle, expectedOwnCreatedTitles }) => {
      const { calendarPort } = runSync({
        own: [],
        hub: [hubPlaceholderTitled('hub-hold', hubTitle)],
      });

      expect(calendarPort.createdTitlesOn('own')).toEqual(
        expectedOwnCreatedTitles,
      );
    });
  });
});
