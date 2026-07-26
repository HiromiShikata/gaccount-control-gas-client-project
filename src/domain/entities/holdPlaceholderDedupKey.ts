export const holdPlaceholderDedupKey = (
  startAt: Date,
  endAt: Date,
  title: string,
): string => `${startAt.getTime()}_${endAt.getTime()}_${title}`;
