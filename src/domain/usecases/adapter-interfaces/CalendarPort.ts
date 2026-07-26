import { CalendarEvent } from '../../entities/CalendarEvent';
import { CalendarRef } from '../../entities/CalendarRef';
import { HoldPlaceholder } from '../../entities/HoldPlaceholder';

export interface CalendarPort {
  exists(calendar: CalendarRef): boolean;
  listTimedEvents(calendar: CalendarRef, from: Date, to: Date): CalendarEvent[];
  createHoldPlaceholder(
    calendar: CalendarRef,
    placeholder: HoldPlaceholder,
  ): void;
  deleteEvent(calendar: CalendarRef, eventId: string): void;
}
