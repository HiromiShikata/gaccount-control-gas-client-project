import { LogPort } from './adapter-interfaces/LogPort';
import { ScriptLockPort } from './adapter-interfaces/ScriptLockPort';

const SYNC_RUN_LOCK_WAIT_MILLISECONDS = 1000;

export class SyncRunUseCase {
  constructor(
    readonly scriptLockPort: ScriptLockPort,
    readonly logPort: LogPort,
  ) {}

  execute(run: () => void): void {
    if (!this.scriptLockPort.tryAcquire(SYNC_RUN_LOCK_WAIT_MILLISECONDS)) {
      this.logPort.error(
        'Another sync run holds the script lock, skipping this run',
      );
      return;
    }
    try {
      run();
    } finally {
      this.scriptLockPort.release();
    }
  }
}
