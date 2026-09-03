import { ScriptPropertiesMeetingBufferStatePort } from './ScriptPropertiesMeetingBufferStatePort';

const makeProperties = (
  stored: string | null,
): GoogleAppsScript.Properties.Properties =>
  ({
    getProperty: jest.fn((): string | null => stored),
    setProperty: jest.fn(),
  }) as unknown as GoogleAppsScript.Properties.Properties;

describe('ScriptPropertiesMeetingBufferStatePort', () => {
  describe('getProcessedEventSnapshots', () => {
    it('returns an empty map when no value is stored', () => {
      const port = new ScriptPropertiesMeetingBufferStatePort(
        makeProperties(null),
      );
      expect(port.getProcessedEventSnapshots()).toEqual(new Map());
    });

    it('returns snapshots parsed from stored JSON', () => {
      const stored = JSON.stringify({
        'event-1': { startMs: 1000, endMs: 2000, title: 'Standup' },
      });
      const port = new ScriptPropertiesMeetingBufferStatePort(
        makeProperties(stored),
      );
      expect(port.getProcessedEventSnapshots().get('event-1')).toEqual({
        startMs: 1000,
        endMs: 2000,
        title: 'Standup',
      });
    });

    it('returns an empty map and logs to console.error when stored value is invalid JSON', () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const port = new ScriptPropertiesMeetingBufferStatePort(
        makeProperties('not-json'),
      );

      const result = port.getProcessedEventSnapshots();

      expect(result).toEqual(new Map());
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse processed event snapshots'),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('setProcessedEventSnapshots', () => {
    it('serializes the map to JSON and stores it via setProperty', () => {
      const properties = makeProperties(null);
      const port = new ScriptPropertiesMeetingBufferStatePort(properties);
      const snapshots = new Map([
        ['event-1', { startMs: 1000, endMs: 2000, title: 'Standup' }],
      ]);

      port.setProcessedEventSnapshots(snapshots);

      expect(properties.setProperty).toHaveBeenCalledWith(
        'MEETING_BUFFER_PROCESSED_EVENT_SNAPSHOTS',
        JSON.stringify({
          'event-1': { startMs: 1000, endMs: 2000, title: 'Standup' },
        }),
      );
    });
  });
});
