import { CalendarEvent } from '../../entities/CalendarEvent';
import { CalendarEventColor } from '../../entities/CalendarEventColor';
import { CalendarRef } from '../../entities/CalendarRef';

export interface CalendarPort {
  exists(calendar: CalendarRef): boolean;
  listTimedEvents(calendar: CalendarRef, from: Date, to: Date): CalendarEvent[];
  deleteEvent(calendar: CalendarRef, eventId: string): void;
  setEventColor(
    calendar: CalendarRef,
    eventId: string,
    color: CalendarEventColor,
  ): void;
}
