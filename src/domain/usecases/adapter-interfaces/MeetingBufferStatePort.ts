export interface ProcessedEventSnapshot {
  startMs: number;
  endMs: number;
}

export interface MeetingBufferStatePort {
  getProcessedEventSnapshots(): Map<string, ProcessedEventSnapshot>;
  setProcessedEventSnapshots(
    snapshots: Map<string, ProcessedEventSnapshot>,
  ): void;
}
