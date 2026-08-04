import { CalendarSubscriptionPort } from '../domain/usecases/adapter-interfaces/CalendarSubscriptionPort';

export class CalendarAppCalendarSubscriptionPort implements CalendarSubscriptionPort {
  subscribe(calendarId: string): void {
    CalendarApp.subscribeToCalendar(calendarId);
  }
}
