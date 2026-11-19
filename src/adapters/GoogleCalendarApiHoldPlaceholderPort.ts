import { CalendarRef } from '../domain/entities/CalendarRef';
import { HoldPlaceholder } from '../domain/entities/HoldPlaceholder';
import { HoldPlaceholderPort } from '../domain/usecases/adapter-interfaces/HoldPlaceholderPort';

const PRIMARY_CALENDAR_ID = 'primary';
const LIST_FIELDS = 'items(iCalUID,reminders),nextPageToken';

export const hasInvalidReminders = (
  reminders: GoogleAppsScript.Calendar.Schema.EventReminders | undefined,
): boolean => {
  if (reminders === undefined) {
    return true;
  }
  if (reminders.useDefault !== false) {
    return true;
  }
  return (reminders.overrides ?? []).length > 0;
};

const resolveCalendarId = (calendar: CalendarRef): string =>
  calendar.type === 'own' ? PRIMARY_CALENDAR_ID : calendar.hubCalendarId;

const advancedCalendarService = (): GoogleAppsScript.Calendar => {
  if (typeof Calendar === 'undefined') {
    throw new Error(
      'The advanced Calendar service is not enabled in the Apps Script manifest',
    );
  }
  return Calendar;
};

export class GoogleCalendarApiHoldPlaceholderPort implements HoldPlaceholderPort {
  listICalUidsWithInvalidReminders(
    calendar: CalendarRef,
    from: Date,
    to: Date,
  ): string[] {
    const calendarId = resolveCalendarId(calendar);
    const service = advancedCalendarService();
    const invalidEventIds: string[] = [];
    let pageToken: string | undefined = undefined;
    do {
      const request = {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        fields: LIST_FIELDS,
      };
      const page: GoogleAppsScript.Calendar.Schema.Events = service.Events.list(
        calendarId,
        pageToken === undefined ? request : { ...request, pageToken },
      );
      const items = page.items ?? [];
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (item.iCalUID === undefined) {
          throw new Error(
            `Calendar event at index ${index} of calendar ${calendarId} has no iCalUID`,
          );
        }
        if (hasInvalidReminders(item.reminders)) {
          invalidEventIds.push(item.iCalUID);
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);
    return invalidEventIds;
  }

  createHoldPlaceholder(
    calendar: CalendarRef,
    placeholder: HoldPlaceholder,
  ): void {
    advancedCalendarService().Events.insert(
      {
        summary: placeholder.title,
        start: { dateTime: placeholder.startAt.toISOString() },
        end: { dateTime: placeholder.endAt.toISOString() },
        reminders: { useDefault: false, overrides: [] },
        transparency: 'opaque',
      },
      resolveCalendarId(calendar),
    );
  }
}
