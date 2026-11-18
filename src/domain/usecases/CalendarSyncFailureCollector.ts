export class CalendarSyncFailureCollector {
  private readonly failures: string[] = [];

  attempt(item: string, operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.failures.push(`${item}: ${this.describe(error)}`);
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
