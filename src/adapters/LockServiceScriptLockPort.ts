import { ScriptLockPort } from '../domain/usecases/adapter-interfaces/ScriptLockPort';

export class LockServiceScriptLockPort implements ScriptLockPort {
  constructor(readonly lock: GoogleAppsScript.Lock.Lock) {}

  tryAcquire(waitMilliseconds: number): boolean {
    return this.lock.tryLock(waitMilliseconds);
  }

  release(): void {
    this.lock.releaseLock();
  }
}
