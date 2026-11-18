import { holdPlaceholderDedupKey } from './holdPlaceholderDedupKey';

export class ExistingHoldPlaceholder {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly startAt: Date,
    readonly endAt: Date,
    readonly hasRemindersRemoved: boolean = false,
  ) {}

  dedupKey(): string {
    return holdPlaceholderDedupKey(this.startAt, this.endAt, this.title);
  }
}
