import { CalendarEvent } from '../domain/entities/CalendarEvent';
import { CalendarEventColor } from '../domain/entities/CalendarEventColor';
import { CalendarRef } from '../domain/entities/CalendarRef';
import { HoldPlaceholder } from '../domain/entities/HoldPlaceholder';
import { CalendarPort } from '../domain/usecases/adapter-interfaces/CalendarPort';

export class CalendarAppCalendarPort implements CalendarPort {
  private readonly listTimedEventsCache = new Map<string, CalendarEvent[]>();

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
    const calendarId = calendar.type === 'own' ? 'own' : calendar.hubCalendarId;
    const key = `${calendarId}_${from.getTime()}_${to.getTime()}`;
    const cached = this.listTimedEventsCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const events = this.resolve(calendar)
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
    this.listTimedEventsCache.set(key, events);
    return events;
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
      try {
        event.deleteEvent();
      } catch (error) {
        console.error(`Failed to delete event ${eventId}: ${String(error)}`);
      }
    }
  }

  setEventColor(
    calendar: CalendarRef,
    eventId: string,
    color: CalendarEventColor,
  ): void {
    const event = this.resolve(calendar).getEventById(eventId);
    if (event !== null) {
      try {
        if (color === 'flamingo') {
          event.setColor(CalendarApp.EventColor.PALE_RED);
        }
      } catch (error) {
        console.error(
          `Failed to set color of event ${eventId}: ${String(error)}`,
        );
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
