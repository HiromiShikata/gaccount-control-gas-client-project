import { CalendarEvent } from './CalendarEvent';
import {
  LEGACY_PREP_TAG,
  LEGACY_SUMMARY_TAG,
  PREP_TAG,
  SUMMARY_TAG,
} from './CalendarEventTags';
import { ExistingHoldPlaceholder } from './ExistingHoldPlaceholder';
import { HoldPlaceholder } from './HoldPlaceholder';
import {
  HOLD_TAG,
  HoldPlaceholderReconciliation,
} from './HoldPlaceholderReconciliation';

const timedEvent = (
  id: string,
  title: string,
  startAt: Date,
  endAt: Date,
  overrides: { isAllDay?: boolean; isDeclined?: boolean } = {},
): CalendarEvent =>
  new CalendarEvent(
    id,
    title,
    startAt,
    endAt,
    overrides.isAllDay ?? false,
    overrides.isDeclined ?? false,
  );

const OWN_DOMAIN = 'example.com';
const MEETING_OK_TAG = '#meeting-ok';
const MEETING_OK_TITLE = 'Available for meeting';
const START = new Date('2020-01-01T09:00:00Z');
const END = new Date('2020-01-01T09:30:00Z');

describe('HoldPlaceholderReconciliation', () => {
  describe('computePushDesiredPlaceholders', () => {
    it('maps own timed events to hub placeholders titled with domain and original title', () => {
      const desired =
        HoldPlaceholderReconciliation.computePushDesiredPlaceholders(
          [timedEvent('a', 'Standup', START, END)],
          OWN_DOMAIN,
        );
      expect(desired).toEqual([
        new HoldPlaceholder(`${HOLD_TAG} ${OWN_DOMAIN} Standup`, START, END),
      ]);
    });

    it('skips all-day events', () => {
      const desired =
        HoldPlaceholderReconciliation.computePushDesiredPlaceholders(
          [timedEvent('a', 'Offsite', START, END, { isAllDay: true })],
          OWN_DOMAIN,
        );
      expect(desired).toEqual([]);
    });

    it('skips events already tagged as a hold', () => {
      const desired =
        HoldPlaceholderReconciliation.computePushDesiredPlaceholders(
          [timedEvent('a', `${HOLD_TAG} other.com Meeting`, START, END)],
          OWN_DOMAIN,
        );
      expect(desired).toEqual([]);
    });

    it('skips declined events', () => {
      const desired =
        HoldPlaceholderReconciliation.computePushDesiredPlaceholders(
          [timedEvent('a', 'Standup', START, END, { isDeclined: true })],
          OWN_DOMAIN,
        );
      expect(desired).toEqual([]);
    });

    it('deduplicates placeholders sharing start, end, and title', () => {
      const desired =
        HoldPlaceholderReconciliation.computePushDesiredPlaceholders(
          [
            timedEvent('a', 'Standup', START, END),
            timedEvent('b', 'Standup', START, END),
          ],
          OWN_DOMAIN,
        );
      expect(desired).toEqual([
        new HoldPlaceholder(`${HOLD_TAG} ${OWN_DOMAIN} Standup`, START, END),
      ]);
    });
  });

  describe('computePullDesiredPlaceholders', () => {
    it('maps hub timed events to plain hold placeholders on the own calendar', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', 'External Sync', START, END)],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([new HoldPlaceholder(HOLD_TAG, START, END)]);
    });

    it('uses the meeting-ok title when the hub event contains the meeting-ok tag', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', `Coffee chat ${MEETING_OK_TAG}`, START, END)],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([
        new HoldPlaceholder(MEETING_OK_TITLE, START, END),
      ]);
    });

    it('skips all-day events', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', 'External Sync', START, END, { isAllDay: true })],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([]);
    });

    it('skips this domain own holds already present on the hub', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', `${HOLD_TAG} ${OWN_DOMAIN} Standup`, START, END)],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([]);
    });

    it('mirrors holds belonging to other domains as plain holds', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', `${HOLD_TAG} other.com Standup`, START, END)],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([new HoldPlaceholder(HOLD_TAG, START, END)]);
    });

    it('skips declined events', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', 'External Sync', START, END, { isDeclined: true })],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([]);
    });

    it('skips hub prep buffer events to prevent mirroring them to the own calendar', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', `${PREP_TAG} Standup`, START, END)],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([]);
    });

    it('skips hub summary buffer events to prevent mirroring them to the own calendar', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', `${SUMMARY_TAG} Standup`, START, END)],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([]);
    });

    it('skips legacy bracket-format hub prep events to prevent mirroring them to the own calendar', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', `${LEGACY_PREP_TAG} Standup`, START, END)],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([]);
    });

    it('skips legacy bracket-format hub summary events to prevent mirroring them to the own calendar', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [timedEvent('a', `${LEGACY_SUMMARY_TAG} Standup`, START, END)],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([]);
    });

    it('deduplicates placeholders sharing start, end, and title', () => {
      const desired =
        HoldPlaceholderReconciliation.computePullDesiredPlaceholders(
          [
            timedEvent('a', 'External Sync', START, END),
            timedEvent('b', 'Other Sync', START, END),
          ],
          OWN_DOMAIN,
          MEETING_OK_TAG,
          MEETING_OK_TITLE,
        );
      expect(desired).toEqual([new HoldPlaceholder(HOLD_TAG, START, END)]);
    });
  });

  describe('selectPushExistingPlaceholders', () => {
    it('selects only hub events whose title starts with this domain hold prefix', () => {
      const existing =
        HoldPlaceholderReconciliation.selectPushExistingPlaceholders(
          [
            timedEvent('a', `${HOLD_TAG} ${OWN_DOMAIN} Standup`, START, END),
            timedEvent('b', `${HOLD_TAG} other.com Standup`, START, END),
            timedEvent('c', 'External Sync', START, END),
          ],
          OWN_DOMAIN,
        );
      expect(existing).toEqual([
        new ExistingHoldPlaceholder(
          'a',
          `${HOLD_TAG} ${OWN_DOMAIN} Standup`,
          START,
          END,
        ),
      ]);
    });
  });

  describe('selectPullExistingPlaceholders', () => {
    it('selects only own events whose title starts with the hold tag', () => {
      const existing =
        HoldPlaceholderReconciliation.selectPullExistingPlaceholders([
          timedEvent('a', HOLD_TAG, START, END),
          timedEvent('b', 'Standup', START, END),
        ]);
      expect(existing).toEqual([
        new ExistingHoldPlaceholder('a', HOLD_TAG, START, END),
      ]);
    });
  });

  describe('reconcile', () => {
    it('creates desired placeholders that do not yet exist', () => {
      const desired = [new HoldPlaceholder(HOLD_TAG, START, END)];
      const result = HoldPlaceholderReconciliation.reconcile(desired, []);
      expect(result.toCreate).toEqual([
        new HoldPlaceholder(HOLD_TAG, START, END),
      ]);
      expect(result.toDelete).toEqual([]);
    });

    it('deletes stale existing placeholders no longer desired', () => {
      const stale = new ExistingHoldPlaceholder('stale', HOLD_TAG, START, END);
      const result = HoldPlaceholderReconciliation.reconcile([], [stale]);
      expect(result.toCreate).toEqual([]);
      expect(result.toDelete).toEqual([stale]);
    });

    it('keeps a placeholder that already exists with the same start, end, and title', () => {
      const desired = [new HoldPlaceholder(HOLD_TAG, START, END)];
      const existing = [
        new ExistingHoldPlaceholder('keep', HOLD_TAG, START, END),
      ];
      const result = HoldPlaceholderReconciliation.reconcile(desired, existing);
      expect(result.toCreate).toEqual([]);
      expect(result.toDelete).toEqual([]);
    });

    it('treats a title change as a stale delete plus a fresh create', () => {
      const desired = [
        new HoldPlaceholder(`${HOLD_TAG} ${OWN_DOMAIN} New`, START, END),
      ];
      const existing = [
        new ExistingHoldPlaceholder(
          'old',
          `${HOLD_TAG} ${OWN_DOMAIN} Old`,
          START,
          END,
        ),
      ];
      const result = HoldPlaceholderReconciliation.reconcile(desired, existing);
      expect(result.toCreate).toEqual([
        new HoldPlaceholder(`${HOLD_TAG} ${OWN_DOMAIN} New`, START, END),
      ]);
      expect(result.toDelete).toEqual([existing[0]]);
    });

    it('deduplicates the create list by start, end, and title', () => {
      const desired = [
        new HoldPlaceholder(HOLD_TAG, START, END),
        new HoldPlaceholder(HOLD_TAG, START, END),
      ];
      const result = HoldPlaceholderReconciliation.reconcile(desired, []);
      expect(result.toCreate).toEqual([
        new HoldPlaceholder(HOLD_TAG, START, END),
      ]);
    });
  });
});
