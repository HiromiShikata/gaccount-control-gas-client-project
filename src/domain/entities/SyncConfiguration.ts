export class SyncConfiguration {
  constructor(
    readonly hubCalendarId: string,
    readonly syncDays: number,
    readonly meetingOkTag: string,
    readonly meetingOkTitle: string,
  ) {}

  static parseSyncDays(syncDaysRaw: string): number {
    const syncDays = Number.parseInt(syncDaysRaw, 10);
    if (!Number.isInteger(syncDays) || syncDays <= 0) {
      throw new Error(
        `SYNC_DAYS must be a positive integer, received "${syncDaysRaw}"`,
      );
    }
    return syncDays;
  }

  static create(
    hubCalendarId: string,
    syncDaysRaw: string,
    meetingOkTag: string,
    meetingOkTitle: string,
  ): SyncConfiguration {
    SyncConfiguration.requireNonEmpty('HUB_CALENDAR_ID', hubCalendarId);
    SyncConfiguration.requireNonEmpty('MEETING_OK_TAG', meetingOkTag);
    SyncConfiguration.requireNonEmpty('MEETING_OK_TITLE', meetingOkTitle);
    return new SyncConfiguration(
      hubCalendarId,
      SyncConfiguration.parseSyncDays(syncDaysRaw),
      meetingOkTag,
      meetingOkTitle,
    );
  }

  toScriptProperties(): Record<string, string> {
    return {
      HUB_CALENDAR_ID: this.hubCalendarId,
      SYNC_DAYS: String(this.syncDays),
      MEETING_OK_TAG: this.meetingOkTag,
      MEETING_OK_TITLE: this.meetingOkTitle,
    };
  }

  private static requireNonEmpty(key: string, value: string): void {
    if (value === '') {
      throw new Error(`${key} must not be empty`);
    }
  }
}
