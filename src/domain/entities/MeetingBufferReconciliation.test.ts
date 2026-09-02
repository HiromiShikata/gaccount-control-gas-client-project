import { CalendarEvent } from './CalendarEvent';
import { ExistingHoldPlaceholder } from './ExistingHoldPlaceholder';
import { HoldPlaceholder } from './HoldPlaceholder';
import { HOLD_TAG } from './HoldPlaceholderReconciliation';
import {
  MEETING_BUFFER_TITLE,
  MeetingBufferReconciliation,
  PREP_TAG,
  SUMMARY_TAG,
} from './MeetingBufferReconciliation';

const BUFFER_MS = 15 * 60 * 1000;

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

const START = new Date('2020-01-01T09:00:00Z');
const END = new Date('2020-01-01T09:30:00Z');

describe('MeetingBufferReconciliation', () => {
  describe('computeDesiredBuffers', () => {
    it('produces a prep and a summary buffer for each qualifying event', () => {
      const buffers = MeetingBufferReconciliation.computeDesiredBuffers([
        timedEvent('a', 'Standup', START, END),
      ]);
      expect(buffers).toEqual([
        new HoldPlaceholder(
          `${PREP_TAG} Standup`,
          new Date(START.getTime() - BUFFER_MS),
          START,
        ),
        new HoldPlaceholder(
          `${SUMMARY_TAG} Standup`,
          END,
          new Date(END.getTime() + BUFFER_MS),
        ),
      ]);
    });

    it('skips all-day events', () => {
      const buffers = MeetingBufferReconciliation.computeDesiredBuffers([
        timedEvent('a', 'Offsite', START, END, { isAllDay: true }),
      ]);
      expect(buffers).toEqual([]);
    });

    it('skips declined events', () => {
      const buffers = MeetingBufferReconciliation.computeDesiredBuffers([
        timedEvent('a', 'Standup', START, END, { isDeclined: true }),
      ]);
      expect(buffers).toEqual([]);
    });

    it('skips hold placeholder events', () => {
      const buffers = MeetingBufferReconciliation.computeDesiredBuffers([
        timedEvent('a', `${HOLD_TAG} other.com Meeting`, START, END),
      ]);
      expect(buffers).toEqual([]);
    });

    it('skips existing prep buffer events to prevent buffer-of-buffer', () => {
      const buffers = MeetingBufferReconciliation.computeDesiredBuffers([
        timedEvent('a', `${PREP_TAG} Standup`, START, END),
      ]);
      expect(buffers).toEqual([]);
    });

    it('skips existing summary buffer events to prevent buffer-of-buffer', () => {
      const buffers = MeetingBufferReconciliation.computeDesiredBuffers([
        timedEvent('a', `${SUMMARY_TAG} Standup`, START, END),
      ]);
      expect(buffers).toEqual([]);
    });

    it('skips events titled Meeting buffer', () => {
      const buffers = MeetingBufferReconciliation.computeDesiredBuffers([
        timedEvent('a', MEETING_BUFFER_TITLE, START, END),
      ]);
      expect(buffers).toEqual([]);
    });

    it('creates buffers for multiple qualifying events', () => {
      const start2 = new Date('2020-01-01T14:00:00Z');
      const end2 = new Date('2020-01-01T15:00:00Z');
      const buffers = MeetingBufferReconciliation.computeDesiredBuffers([
        timedEvent('a', 'Standup', START, END),
        timedEvent('b', '1-on-1', start2, end2),
      ]);
      expect(buffers).toEqual([
        new HoldPlaceholder(
          `${PREP_TAG} Standup`,
          new Date(START.getTime() - BUFFER_MS),
          START,
        ),
        new HoldPlaceholder(
          `${SUMMARY_TAG} Standup`,
          END,
          new Date(END.getTime() + BUFFER_MS),
        ),
        new HoldPlaceholder(
          `${PREP_TAG} 1-on-1`,
          new Date(start2.getTime() - BUFFER_MS),
          start2,
        ),
        new HoldPlaceholder(
          `${SUMMARY_TAG} 1-on-1`,
          end2,
          new Date(end2.getTime() + BUFFER_MS),
        ),
      ]);
    });
  });

  describe('selectExistingBuffers', () => {
    it('selects only events whose title starts with the prep or summary tag', () => {
      const existing = MeetingBufferReconciliation.selectExistingBuffers([
        timedEvent('prep', `${PREP_TAG} Standup`, START, END),
        timedEvent('summary', `${SUMMARY_TAG} Standup`, START, END),
        timedEvent('regular', 'Standup', START, END),
        timedEvent('hold', `${HOLD_TAG} Meeting`, START, END),
      ]);
      expect(existing).toEqual([
        new ExistingHoldPlaceholder('prep', `${PREP_TAG} Standup`, START, END),
        new ExistingHoldPlaceholder(
          'summary',
          `${SUMMARY_TAG} Standup`,
          START,
          END,
        ),
      ]);
    });

    it('returns an empty list when no buffer events exist', () => {
      const existing = MeetingBufferReconciliation.selectExistingBuffers([
        timedEvent('a', 'Standup', START, END),
      ]);
      expect(existing).toEqual([]);
    });
  });
});
