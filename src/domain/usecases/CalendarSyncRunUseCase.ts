import { CalendarSyncFailureCollector } from './CalendarSyncFailureCollector';

interface HoldMirrorSyncStep {
  execute(now: Date, ownDomain: string): void;
}

interface EventColorSyncStep {
  execute(now: Date): void;
}

export class CalendarSyncRunUseCase {
  constructor(
    readonly holdMirrorSync: HoldMirrorSyncStep,
    readonly eventColorSync: EventColorSyncStep,
  ) {}

  execute(now: Date, ownDomain: string): void {
    const failures = new CalendarSyncFailureCollector();
    failures.attempt('hold mirror sync', () =>
      this.holdMirrorSync.execute(now, ownDomain),
    );
    failures.attempt('event color sync', () =>
      this.eventColorSync.execute(now),
    );
    failures.throwIfAny();
  }
}
