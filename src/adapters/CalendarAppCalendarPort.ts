import { CalendarEvent } from '../domain/entities/CalendarEvent';
import { CalendarEventColor } from '../domain/entities/CalendarEventColor';
import { CalendarRef } from '../domain/entities/CalendarRef';
import { HoldPlaceholder } from '../domain/entities/HoldPlaceholder';
import { REMINDERS_REMOVED_MARKER } from '../domain/entities/CalendarEventTags';
import { CalendarPort } from '../domain/usecases/adapter-interfaces/CalendarPort';

export class CalendarAppCalendarPort implements CalendarPort {
  private readonly listTimedEventsCache = new Map<string, CalendarEvent[]>();
  private readonly calendarCache = new Map<
    string,
    GoogleAppsScript.Calendar.Calendar
  >();
  private readonly gasEventCache = new Map<
    string,
    GoogleAppsScript.Calendar.CalendarEvent
  >();

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
    const gasEvents = this.resolve(calendar).getEvents(from, to);
    const events = gasEvents.map((event) => {
      this.gasEventCache.set(event.getId(), event);
      return new CalendarEvent(
        event.getId(),
        event.getTitle(),
        new Date(event.getStartTime().getTime()),
        new Date(event.getEndTime().getTime()),
        event.isAllDayEvent(),
        event.getMyStatus() === CalendarApp.GuestStatus.NO,
        event.getDescription().includes(REMINDERS_REMOVED_MARKER),
      );
    });
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
    try {
      event.removeAllReminders();
      event.setDescription(REMINDERS_REMOVED_MARKER);
    } catch (error) {
      this.discardCreatedEvent(placeholder, event, error);
    }
  }

  private discardCreatedEvent(
    placeholder: HoldPlaceholder,
    event: GoogleAppsScript.Calendar.CalendarEvent,
    cause: unknown,
  ): never {
    try {
      event.deleteEvent();
    } catch (deleteError) {
      throw new Error(
        `Could not remove reminders from hold placeholder "${placeholder.title}" (${String(cause)}), and deleting the created event also failed (${String(deleteError)})`,
      );
    }
    throw cause;
  }

  removeHoldPlaceholderReminders(calendar: CalendarRef, eventId: string): void {
    const event = this.findEvent(calendar, eventId);
    event.removeAllReminders();
    event.setDescription(withReminderMarker(event.getDescription()));
  }

  deleteEvent(calendar: CalendarRef, eventId: string): void {
    const event = this.findEventIfExists(calendar, eventId);
    if (event !== null) {
      event.deleteEvent();
    }
  }

  setEventColor(
    calendar: CalendarRef,
    eventId: string,
    color: CalendarEventColor,
  ): void {
    const cachedEvent = this.gasEventCache.get(eventId);
    const event =
      cachedEvent !== undefined
        ? cachedEvent
        : this.resolve(calendar).getEventById(eventId);
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

  private findEvent(
    calendar: CalendarRef,
    eventId: string,
  ): GoogleAppsScript.Calendar.CalendarEvent {
    const event = this.findEventIfExists(calendar, eventId);
    if (event === null) {
      throw new Error(`Calendar event is not found: ${eventId}`);
    }
    return event;
  }

  private findEventIfExists(
    calendar: CalendarRef,
    eventId: string,
  ): GoogleAppsScript.Calendar.CalendarEvent | null {
    const cachedEvent = this.gasEventCache.get(eventId);
    return cachedEvent !== undefined
      ? cachedEvent
      : this.resolve(calendar).getEventById(eventId);
  }

  private resolve(calendar: CalendarRef): GoogleAppsScript.Calendar.Calendar {
    const key = calendar.type === 'own' ? 'own' : calendar.hubCalendarId;
    const cached = this.calendarCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    let resolved: GoogleAppsScript.Calendar.Calendar;
    if (calendar.type === 'own') {
      resolved = CalendarApp.getDefaultCalendar();
    } else {
      const hub = CalendarApp.getCalendarById(calendar.hubCalendarId);
      if (hub === null) {
        throw new Error(
          `Hub calendar is not accessible: ${calendar.hubCalendarId}`,
        );
      }
      resolved = hub;
    }
    this.calendarCache.set(key, resolved);
    return resolved;
  }
}

const withReminderMarker = (description: string): string => {
  if (description.includes(REMINDERS_REMOVED_MARKER)) {
    return description;
  }
  return description === ''
    ? REMINDERS_REMOVED_MARKER
    : `${description}\n${REMINDERS_REMOVED_MARKER}`;
};
