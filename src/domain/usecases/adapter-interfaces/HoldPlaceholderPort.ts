import { CalendarRef } from '../../entities/CalendarRef';
import { HoldPlaceholder } from '../../entities/HoldPlaceholder';

export interface HoldPlaceholderPort {
  listICalUidsWithInvalidReminders(
    calendar: CalendarRef,
    from: Date,
    to: Date,
  ): string[];
  createHoldPlaceholder(
    calendar: CalendarRef,
    placeholder: HoldPlaceholder,
  ): void;
}
