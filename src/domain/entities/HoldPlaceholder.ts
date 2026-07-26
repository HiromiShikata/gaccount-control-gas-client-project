import { holdPlaceholderDedupKey } from './holdPlaceholderDedupKey';

export class HoldPlaceholder {
  constructor(
    readonly title: string,
    readonly startAt: Date,
    readonly endAt: Date,
  ) {}

  dedupKey(): string {
    return holdPlaceholderDedupKey(this.startAt, this.endAt, this.title);
  }
}
