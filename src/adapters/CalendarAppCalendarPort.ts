import { CalendarEvent } from '../domain/entities/CalendarEvent';
import { CalendarEventColor } from '../domain/entities/CalendarEventColor';
import { CalendarRef } from '../domain/entities/CalendarRef';
import { HoldPlaceholder } from '../domain/entities/HoldPlaceholder';
import { CalendarPort } from '../domain/usecases/adapter-interfaces/CalendarPort';

export class CalendarAppCalendarPort implements CalendarPort {
  exists(calendar: CalendarRef): boolean {
    if (calendar.type === 'own') {
      return true;
    }
    return CalendarApp.getCalendarById(calendar.hubCalendarId) !== null;
  }

  listTimedEvents(
    calendar: CalendarRef,
    from: Date,
    to: Date,
  ): CalendarEvent[] {
    return this.resolve(calendar)
      .getEvents(from, to)
      .map(
        (event) =>
          new CalendarEvent(
            event.getId(),
            event.getTitle(),
            new Date(event.getStartTime().getTime()),
            new Date(event.getEndTime().getTime()),
            event.isAllDayEvent(),
            event.getMyStatus() === CalendarApp.GuestStatus.NO,
          ),
      );
  }

  createHoldPlaceholder(
    calendar: CalendarRef,
    placeholder: HoldPlaceholder,
  ): void {
    const event = this.resolve(calendar).createEvent(
      placeholder.title,
      placeholder.startAt,
      placeholder.endAt,
    );
    event.removeAllReminders();
    event.setTransparency(CalendarApp.EventTransparency.OPAQUE);
  }

  deleteEvent(calendar: CalendarRef, eventId: string): void {
    const event = this.resolve(calendar).getEventById(eventId);
    if (event !== null) {
      event.deleteEvent();
    }
  }

  setEventColor(
    calendar: CalendarRef,
    eventId: string,
    color: CalendarEventColor,
  ): void {
    const event = this.resolve(calendar).getEventById(eventId);
    if (event !== null) {
      if (color === 'flamingo') {
        event.setColor(CalendarApp.EventColor.PALE_RED);
      }
    }
  }

  private resolve(calendar: CalendarRef): GoogleAppsScript.Calendar.Calendar {
    if (calendar.type === 'own') {
      return CalendarApp.getDefaultCalendar();
    }
    const hub = CalendarApp.getCalendarById(calendar.hubCalendarId);
    if (hub === null) {
      throw new Error(
        `Hub calendar is not accessible: ${calendar.hubCalendarId}`,
      );
    }
    return hub;
  }
}
