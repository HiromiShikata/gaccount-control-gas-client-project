import { CalendarEvent } from './CalendarEvent';
import { ExistingHoldPlaceholder } from './ExistingHoldPlaceholder';
import { HoldPlaceholder } from './HoldPlaceholder';
import { HOLD_TAG } from './HoldPlaceholderReconciliation';

export const PREP_TAG = '[PREP]';
export const SUMMARY_TAG = '[SUMMARY]';

const BUFFER_MINUTES = 5;
const BUFFER_MS = BUFFER_MINUTES * 60 * 1000;

export class MeetingBufferReconciliation {
  static computeDesiredBuffers(ownEvents: CalendarEvent[]): HoldPlaceholder[] {
    return ownEvents
      .filter((event) => !event.isAllDay)
      .filter((event) => !event.isDeclined)
      .filter((event) => !event.title.startsWith(HOLD_TAG))
      .filter((event) => !event.title.startsWith(PREP_TAG))
      .filter((event) => !event.title.startsWith(SUMMARY_TAG))
      .flatMap((event) => [
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
    ownEvents: CalendarEvent[],
  ): ExistingHoldPlaceholder[] {
    return ownEvents
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
}
