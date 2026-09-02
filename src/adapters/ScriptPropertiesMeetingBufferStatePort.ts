import {
  MeetingBufferStatePort,
  ProcessedEventSnapshot,
} from '../domain/usecases/adapter-interfaces/MeetingBufferStatePort';

const PROPERTY_KEY = 'MEETING_BUFFER_PROCESSED_EVENT_SNAPSHOTS';

export class ScriptPropertiesMeetingBufferStatePort implements MeetingBufferStatePort {
  constructor(readonly properties: GoogleAppsScript.Properties.Properties) {}

  getProcessedEventSnapshots(): Map<string, ProcessedEventSnapshot> {
    const value = this.properties.getProperty(PROPERTY_KEY);
    if (!value) return new Map<string, ProcessedEventSnapshot>();
    try {
      const parsed = JSON.parse(value) as Record<
        string,
        ProcessedEventSnapshot
      >;
      return new Map(Object.entries(parsed));
    } catch {
      return new Map<string, ProcessedEventSnapshot>();
    }
  }

  setProcessedEventSnapshots(
    snapshots: Map<string, ProcessedEventSnapshot>,
  ): void {
    const obj: Record<string, ProcessedEventSnapshot> = {};
    for (const [id, snapshot] of snapshots) {
      obj[id] = snapshot;
    }
    this.properties.setProperty(PROPERTY_KEY, JSON.stringify(obj));
  }
}
