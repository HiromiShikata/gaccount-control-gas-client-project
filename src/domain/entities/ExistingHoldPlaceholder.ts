import { holdPlaceholderDedupKey } from './holdPlaceholderDedupKey';

export class ExistingHoldPlaceholder {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly startAt: Date,
    readonly endAt: Date,
  ) {}

  dedupKey(): string {
    return holdPlaceholderDedupKey(this.startAt, this.endAt, this.title);
  }
}
