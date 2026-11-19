import { CalendarSyncFailureCollector } from './CalendarSyncFailureCollector';

describe('CalendarSyncFailureCollector', () => {
  it.each([
    {
      name: 'does not throw when every operation succeeds',
      operations: [
        { item: 'first', fail: false },
        { item: 'second', fail: false },
      ],
      expectedThrow: undefined,
      expectedRunCount: 2,
    },
    {
      name: 'runs every operation and names only the failed one',
      operations: [
        { item: 'first', fail: true },
        { item: 'second', fail: false },
      ],
      expectedThrow: /first.*boom/,
      expectedRunCount: 2,
    },
    {
      name: 'names every failed operation',
      operations: [
        { item: 'first', fail: true },
        { item: 'second', fail: true },
      ],
      expectedThrow: /first.*boom[\s\S]*second.*boom/,
      expectedRunCount: 2,
    },
  ])('$name', ({ operations, expectedThrow, expectedRunCount }) => {
    const collector = new CalendarSyncFailureCollector();
    const run = jest.fn();
    for (const operation of operations) {
      collector.attempt(operation.item, () => {
        run(operation.item);
        if (operation.fail) {
          throw new Error('boom');
        }
      });
    }

    if (expectedThrow === undefined) {
      expect(() => collector.throwIfAny()).not.toThrow();
    } else {
      expect(() => collector.throwIfAny()).toThrow(expectedThrow);
    }
    expect(run).toHaveBeenCalledTimes(expectedRunCount);
  });
});

describe('CalendarSyncFailureCollector.attempt result', () => {
  it('returns true when the operation succeeds and false when it fails', () => {
    const collector = new CalendarSyncFailureCollector();

    expect(collector.attempt('ok', () => {})).toBe(true);
    expect(
      collector.attempt('bad', () => {
        throw new Error('boom');
      }),
    ).toBe(false);
  });
});
