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

export { HOLD_TAG };

export class HoldPlaceholderReconciliation {
  static computePushDesiredPlaceholders(
    ownEvents: CalendarEvent[],
    ownDomain: string,
  ): HoldPlaceholder[] {
    const desired = ownEvents
      .filter((event) => !event.isAllDay)
      .filter((event) => !event.title.includes(HOLD_TAG))
      .filter((event) => !event.isDeclined)
      .map(
        (event) =>
          new HoldPlaceholder(
            `${HOLD_TAG} ${ownDomain} ${event.title}`,
            event.startAt,
            event.endAt,
          ),
      );
    return HoldPlaceholderReconciliation.deduplicate(desired);
  }

  static computePullDesiredPlaceholders(
    hubEvents: CalendarEvent[],
    ownDomain: string,
    meetingOkTag: string,
    meetingOkTitle: string,
  ): HoldPlaceholder[] {
    const ownHoldPrefix = `${HOLD_TAG} ${ownDomain}`;
    const desired = hubEvents
      .filter((event) => !event.isAllDay)
      .filter((event) => !event.title.startsWith(ownHoldPrefix))
      .filter((event) => !event.isDeclined)
      .filter((event) => !event.title.startsWith(PREP_TAG))
      .filter((event) => !event.title.startsWith(SUMMARY_TAG))
      .filter((event) => !event.title.startsWith(LEGACY_PREP_TAG))
      .filter((event) => !event.title.startsWith(LEGACY_SUMMARY_TAG))
      .map(
        (event) =>
          new HoldPlaceholder(
            event.title.includes(meetingOkTag) ? meetingOkTitle : HOLD_TAG,
            event.startAt,
            event.endAt,
          ),
      );
    return HoldPlaceholderReconciliation.deduplicate(desired);
  }

  static selectPushExistingPlaceholders(
    hubEvents: CalendarEvent[],
    ownDomain: string,
  ): ExistingHoldPlaceholder[] {
    const ownHoldPrefix = `${HOLD_TAG} ${ownDomain}`;
    return hubEvents
      .filter((event) => event.title.startsWith(ownHoldPrefix))
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

  static selectPullExistingPlaceholders(
    ownEvents: CalendarEvent[],
  ): ExistingHoldPlaceholder[] {
    return ownEvents
      .filter((event) => event.title.startsWith(HOLD_TAG))
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

  static reconcile(
    desired: HoldPlaceholder[],
    existing: ExistingHoldPlaceholder[],
  ): { toCreate: HoldPlaceholder[]; toDelete: ExistingHoldPlaceholder[] } {
    const existingKeys = new Set(
      existing.map((placeholder) => placeholder.dedupKey()),
    );
    const desiredKeys = new Set(
      desired.map((placeholder) => placeholder.dedupKey()),
    );
    const toCreate = HoldPlaceholderReconciliation.deduplicate(desired).filter(
      (placeholder) => !existingKeys.has(placeholder.dedupKey()),
    );
    const toDelete = existing.filter(
      (placeholder) => !desiredKeys.has(placeholder.dedupKey()),
    );
    return { toCreate, toDelete };
  }

  private static deduplicate(
    placeholders: HoldPlaceholder[],
  ): HoldPlaceholder[] {
    const seen = new Set<string>();
    const unique: HoldPlaceholder[] = [];
    for (const placeholder of placeholders) {
      const key = placeholder.dedupKey();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(placeholder);
      }
    }
    return unique;
  }
}
