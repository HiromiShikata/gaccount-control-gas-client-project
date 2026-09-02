import { CalendarEvent } from '../../entities/CalendarEvent';
import { CalendarEventColor } from '../../entities/CalendarEventColor';
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
  setEventColor(
    calendar: CalendarRef,
    eventId: string,
    color: CalendarEventColor,
  ): void;
}
