import { CalendarEvent } from './CalendarEvent';
import {
  HOLD_TAG,
  LEGACY_PREP_TAG,
  LEGACY_SUMMARY_TAG,
  PREP_TAG,
  SUMMARY_TAG,
} from './CalendarEventTags';
import { ExistingHoldPlaceholder } from './ExistingHoldPlaceholder';
import { HoldPlaceholder } from './HoldPlaceholder';

export const MEETING_BUFFER_TITLE = 'Meeting buffer';

export { PREP_TAG, SUMMARY_TAG };

const BUFFER_MINUTES = 15;
const BUFFER_MS = BUFFER_MINUTES * 60 * 1000;

export class MeetingBufferReconciliation {
  static selectQualifyingSourceEvents(
    events: CalendarEvent[],
  ): CalendarEvent[] {
    return events
      .filter((event) => !event.isAllDay)
      .filter((event) => !event.isDeclined)
      .filter((event) => !event.title.startsWith(HOLD_TAG))
      .filter((event) => !event.title.startsWith(PREP_TAG))
      .filter((event) => !event.title.startsWith(SUMMARY_TAG))
      .filter((event) => !event.title.startsWith(LEGACY_PREP_TAG))
      .filter((event) => !event.title.startsWith(LEGACY_SUMMARY_TAG))
      .filter((event) => event.title !== MEETING_BUFFER_TITLE);
  }

  static computeDesiredBuffers(ownEvents: CalendarEvent[]): HoldPlaceholder[] {
    return MeetingBufferReconciliation.selectQualifyingSourceEvents(
      ownEvents,
    ).flatMap((event) => [
      new HoldPlaceholder(
        `${PREP_TAG} ${event.title}`,
        new Date(event.startAt.getTime() - BUFFER_MS),
        event.startAt,
      ),
      new HoldPlaceholder(
        `${SUMMARY_TAG} ${event.title}`,
        event.endAt,
        new Date(event.endAt.getTime() + BUFFER_MS),
      ),
    ]);
  }

  static selectExistingBuffers(
    events: CalendarEvent[],
  ): ExistingHoldPlaceholder[] {
    return events
      .filter(
        (event) =>
          event.title.startsWith(PREP_TAG) ||
          event.title.startsWith(SUMMARY_TAG),
      )
      .map(
        (event) =>
          new ExistingHoldPlaceholder(
            event.id,
            event.title,
            event.startAt,
            event.endAt,
          ),
      );
  }

  static selectLegacyBuffers(
    events: CalendarEvent[],
  ): ExistingHoldPlaceholder[] {
    return events
      .filter(
        (event) =>
          event.title.startsWith(LEGACY_PREP_TAG) ||
          event.title.startsWith(LEGACY_SUMMARY_TAG),
      )
      .map(
        (event) =>
          new ExistingHoldPlaceholder(
            event.id,
            event.title,
            event.startAt,
            event.endAt,
          ),
      );
  }
}
