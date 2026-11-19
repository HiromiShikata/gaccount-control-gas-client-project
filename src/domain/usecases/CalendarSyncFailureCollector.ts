export class CalendarSyncFailureCollector {
  private readonly failures: string[] = [];

  attempt(item: string, operation: () => void): boolean {
    try {
      operation();
      return true;
    } catch (error) {
      this.failures.push(`${item}: ${this.describe(error)}`);
      return false;
    }
  }

  throwIfAny(): void {
    if (this.failures.length === 0) {
      return;
    }
    throw new Error(
      `${this.failures.length} calendar sync operation(s) failed: ${this.failures.join('; ')}`,
    );
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
