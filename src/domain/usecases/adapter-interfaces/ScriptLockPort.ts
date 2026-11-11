export interface ScriptLockPort {
  tryAcquire(waitMilliseconds: number): boolean;
  release(): void;
}
