import { LockServiceScriptLockPort } from './LockServiceScriptLockPort';

const makeLock = (acquired: boolean) => ({
  tryLock: jest.fn((_waitMilliseconds: number): boolean => acquired),
  releaseLock: jest.fn((): void => {}),
});

describe('LockServiceScriptLockPort', () => {
  describe('tryAcquire', () => {
    it.each([
      { name: 'returns true when the script lock is acquired', acquired: true },
      {
        name: 'returns false when the script lock is not acquired',
        acquired: false,
      },
    ])('$name', ({ acquired }) => {
      const lock = makeLock(acquired);
      const port = new LockServiceScriptLockPort(
        lock as unknown as GoogleAppsScript.Lock.Lock,
      );

      expect({
        result: port.tryAcquire(1000),
        waits: lock.tryLock.mock.calls,
      }).toEqual({ result: acquired, waits: [[1000]] });
    });
  });

  describe('release', () => {
    it('releases the script lock', () => {
      const lock = makeLock(true);
      const port = new LockServiceScriptLockPort(
        lock as unknown as GoogleAppsScript.Lock.Lock,
      );

      port.release();

      expect(lock.releaseLock.mock.calls).toEqual([[]]);
    });
  });
});
