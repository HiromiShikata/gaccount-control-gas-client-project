import { LogPort } from './adapter-interfaces/LogPort';
import { ScriptLockPort } from './adapter-interfaces/ScriptLockPort';
import { SyncRunUseCase } from './SyncRunUseCase';

class InMemoryScriptLockPort implements ScriptLockPort {
  readonly events: string[] = [];

  constructor(private readonly available: boolean) {}

  tryAcquire(): boolean {
    this.events.push('tryAcquire');
    return this.available;
  }

  release(): void {
    this.events.push('release');
  }
}

class InMemoryLogPort implements LogPort {
  readonly messages: string[] = [];

  error(message: string): void {
    this.messages.push(message);
  }
}

describe('SyncRunUseCase acceptance', () => {
  describe('execute with a script lock', () => {
    it.each([
      {
        name: 'does not invoke the run body, logs once and does not release when the lock is held elsewhere',
        lockAvailable: false,
        bodyThrows: false,
        expectedEvents: ['tryAcquire'],
        expectedLogMessages: 1,
        expectedThrownMessage: null,
      },
      {
        name: 'invokes the run body once and releases the lock afterwards when the lock is acquired',
        lockAvailable: true,
        bodyThrows: false,
        expectedEvents: ['tryAcquire', 'run', 'release'],
        expectedLogMessages: 0,
        expectedThrownMessage: null,
      },
      {
        name: 'releases the lock and propagates the error when the run body throws',
        lockAvailable: true,
        bodyThrows: true,
        expectedEvents: ['tryAcquire', 'run', 'release'],
        expectedLogMessages: 0,
        expectedThrownMessage: 'run body failed',
      },
    ])(
      '$name',
      ({
        lockAvailable,
        bodyThrows,
        expectedEvents,
        expectedLogMessages,
        expectedThrownMessage,
      }) => {
        const lock = new InMemoryScriptLockPort(lockAvailable);
        const logPort = new InMemoryLogPort();
        let thrownMessage: string | null = null;

        try {
          new SyncRunUseCase(lock, logPort).execute(() => {
            lock.events.push('run');
            if (bodyThrows) {
              throw new Error('run body failed');
            }
          });
        } catch (error) {
          thrownMessage =
            error instanceof Error ? error.message : String(error);
        }

        expect({
          events: lock.events,
          logMessages: logPort.messages.length,
          thrownMessage,
        }).toEqual({
          events: expectedEvents,
          logMessages: expectedLogMessages,
          thrownMessage: expectedThrownMessage,
        });
      },
    );
  });
});
