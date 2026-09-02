export interface ProcessedEventSnapshot {
  startMs: number;
  endMs: number;
  title: string;
}

export interface MeetingBufferStatePort {
  getProcessedEventSnapshots(): Map<string, ProcessedEventSnapshot>;
  setProcessedEventSnapshots(
    snapshots: Map<string, ProcessedEventSnapshot>,
  ): void;
}
