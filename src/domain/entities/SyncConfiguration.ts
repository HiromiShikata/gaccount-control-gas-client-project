export class SyncConfiguration {
  constructor(
    readonly hubCalendarId: string,
    readonly syncDays: number,
    readonly meetingOkTag: string,
    readonly meetingOkTitle: string,
  ) {}
}
