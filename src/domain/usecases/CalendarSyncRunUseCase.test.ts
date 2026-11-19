import { CalendarSyncRunUseCase } from './CalendarSyncRunUseCase';

const NOW = new Date('2020-01-01T00:00:00Z');

describe('CalendarSyncRunUseCase', () => {
  it.each([
    {
      name: 'runs both steps with the same arguments when both succeed',
      holdFails: false,
      colorFails: false,
      expectedThrow: undefined,
    },
    {
      name: 'still runs the color step when the hold step fails, then throws naming the hold step',
      holdFails: true,
      colorFails: false,
      expectedThrow: /hold mirror sync: hold failed/,
    },
    {
      name: 'still runs the hold step when the color step fails, then throws naming the color step',
      holdFails: false,
      colorFails: true,
      expectedThrow: /event color sync: color failed/,
    },
  ])('$name', ({ holdFails, colorFails, expectedThrow }) => {
    const holdMirrorSync = {
      execute: jest.fn(() => {
        if (holdFails) {
          throw new Error('hold failed');
        }
      }),
    };
    const eventColorSync = {
      execute: jest.fn(() => {
        if (colorFails) {
          throw new Error('color failed');
        }
      }),
    };
    const useCase = new CalendarSyncRunUseCase(holdMirrorSync, eventColorSync);

    if (expectedThrow === undefined) {
      expect(() => useCase.execute(NOW, 'example.com')).not.toThrow();
    } else {
      expect(() => useCase.execute(NOW, 'example.com')).toThrow(expectedThrow);
    }
    expect(holdMirrorSync.execute).toHaveBeenCalledWith(NOW, 'example.com');
    expect(eventColorSync.execute).toHaveBeenCalledWith(NOW);
  });
});
