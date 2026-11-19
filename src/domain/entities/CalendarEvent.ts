export class CalendarEvent {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly startAt: Date,
    readonly endAt: Date,
    readonly isAllDay: boolean,
    readonly isDeclined: boolean,
  ) {}
}
