import { SyncConfiguration } from './SyncConfiguration';

describe('SyncConfiguration.create', () => {
  it('parses the sync day count into a number', () => {
    const configuration = SyncConfiguration.create(
      'hub@example.com',
      '60',
      'tag',
      'title',
    );

    expect(configuration.syncDays).toBe(60);
  });

  it('rejects an empty hub calendar id', () => {
    expect(() => SyncConfiguration.create('', '60', 'tag', 'title')).toThrow(
      'HUB_CALENDAR_ID must not be empty',
    );
  });

  it('rejects an empty meeting ok tag', () => {
    expect(() =>
      SyncConfiguration.create('hub@example.com', '60', '', 'title'),
    ).toThrow('MEETING_OK_TAG must not be empty');
  });

  it('rejects an empty meeting ok title', () => {
    expect(() =>
      SyncConfiguration.create('hub@example.com', '60', 'tag', ''),
    ).toThrow('MEETING_OK_TITLE must not be empty');
  });

  it('rejects a zero sync day count', () => {
    expect(() =>
      SyncConfiguration.create('hub@example.com', '0', 'tag', 'title'),
    ).toThrow('SYNC_DAYS must be a positive integer, received "0"');
  });

  it('rejects a non numeric sync day count', () => {
    expect(() =>
      SyncConfiguration.create('hub@example.com', 'many', 'tag', 'title'),
    ).toThrow('SYNC_DAYS must be a positive integer, received "many"');
  });
});

describe('SyncConfiguration.toScriptProperties', () => {
  it('renders every value as a string keyed by its script property name', () => {
    const configuration = new SyncConfiguration(
      'hub@example.com',
      60,
      'tag',
      'title',
    );

    expect(configuration.toScriptProperties()).toEqual({
      HUB_CALENDAR_ID: 'hub@example.com',
      SYNC_DAYS: '60',
      MEETING_OK_TAG: 'tag',
      MEETING_OK_TITLE: 'title',
    });
  });
});
