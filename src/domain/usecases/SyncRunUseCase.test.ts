import { LogPort } from './adapter-interfaces/LogPort';
import { ScriptLockPort } from './adapter-interfaces/ScriptLockPort';
import { SyncRunUseCase } from './SyncRunUseCase';

class InMemoryScriptLockPort implements ScriptLockPort {
  private held = false;
  readonly acquireAttempts: number[] = [];
  releaseCount = 0;

  constructor(private readonly available: boolean) {}

  tryAcquire(waitMilliseconds: number): boolean {
    this.acquireAttempts.push(waitMilliseconds);
    if (!this.available || this.held) {
      return false;
    }
    this.held = true;
    return true;
  }

  release(): void {
    this.releaseCount += 1;
    this.held = false;
  }

  isHeld(): boolean {
    return this.held;
  }
}

const createLog = () => {
  const messages: string[] = [];
  const logPort: LogPort = {
    error: (message: string): void => {
      messages.push(message);
    },
  };
  return { logPort, messages };
};

describe('SyncRunUseCase', () => {
  describe('execute', () => {
    it.each([
      {
        name: 'runs the sync and releases the lock when the lock is available',
        lockAvailable: true,
        expectedRuns: 1,
        expectedReleases: 1,
        expectedLogMessages: 0,
      },
      {
        name: 'skips the sync, logs a message and does not release when another run holds the lock',
        lockAvailable: false,
        expectedRuns: 0,
        expectedReleases: 0,
        expectedLogMessages: 1,
      },
    ])(
      '$name',
      ({
        lockAvailable,
        expectedRuns,
        expectedReleases,
        expectedLogMessages,
      }) => {
        const lock = new InMemoryScriptLockPort(lockAvailable);
        const { logPort, messages } = createLog();
        let runs = 0;

        new SyncRunUseCase(lock, logPort).execute(() => {
          runs += 1;
        });

        expect({
          runs,
          releases: lock.releaseCount,
          logMessages: messages.length,
          heldAfterRun: lock.isHeld(),
        }).toEqual({
          runs: expectedRuns,
          releases: expectedReleases,
          logMessages: expectedLogMessages,
          heldAfterRun: false,
        });
      },
    );

    it('skips an overlapping run that starts while the lock is held by an earlier run', () => {
      const lock = new InMemoryScriptLockPort(true);
      const { logPort, messages } = createLog();
      const useCase = new SyncRunUseCase(lock, logPort);
      let innerRuns = 0;
      let outerRuns = 0;

      useCase.execute(() => {
        outerRuns += 1;
        useCase.execute(() => {
          innerRuns += 1;
        });
      });

      expect({
        outerRuns,
        innerRuns,
        logMessages: messages.length,
        heldAfterRun: lock.isHeld(),
      }).toEqual({
        outerRuns: 1,
        innerRuns: 0,
        logMessages: 1,
        heldAfterRun: false,
      });
    });

    it('releases the lock and rethrows when the sync fails', () => {
      const lock = new InMemoryScriptLockPort(true);
      const { logPort, messages } = createLog();
      const failure = new Error('sync failed');

      expect(() =>
        new SyncRunUseCase(lock, logPort).execute(() => {
          throw failure;
        }),
      ).toThrow(failure);

      expect({
        releases: lock.releaseCount,
        heldAfterRun: lock.isHeld(),
        logMessages: messages.length,
      }).toEqual({ releases: 1, heldAfterRun: false, logMessages: 0 });
    });

    it('requests a short bounded wait when acquiring the lock', () => {
      const lock = new InMemoryScriptLockPort(true);
      const { logPort } = createLog();

      new SyncRunUseCase(lock, logPort).execute(() => {});

      expect(lock.acquireAttempts).toEqual([1000]);
    });
  });
});
