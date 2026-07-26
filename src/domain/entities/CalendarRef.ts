export type CalendarRef =
  | { readonly type: 'own' }
  | { readonly type: 'hub'; readonly hubCalendarId: string };
