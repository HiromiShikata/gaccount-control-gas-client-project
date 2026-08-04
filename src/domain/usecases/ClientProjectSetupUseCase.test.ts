import { SyncConfiguration } from '../entities/SyncConfiguration';
import { CalendarSubscriptionPort } from './adapter-interfaces/CalendarSubscriptionPort';
import { ConfigWritePort } from './adapter-interfaces/ConfigWritePort';
import { TriggerPort } from './adapter-interfaces/TriggerPort';
import { ClientProjectSetupUseCase } from './ClientProjectSetupUseCase';

class RecordingConfigWritePort implements ConfigWritePort {
  written: Record<string, string> | null = null;

  setAll(values: Record<string, string>): void {
    this.written = values;
  }
}

class RecordingCalendarSubscriptionPort implements CalendarSubscriptionPort {
  subscribed: string[] = [];

  subscribe(calendarId: string): void {
    this.subscribed.push(calendarId);
  }
}

class RecordingTriggerPort implements TriggerPort {
  createdCount = 0;

  createSyncTrigger(): void {
    this.createdCount += 1;
  }
}

const buildUseCase = (): {
  useCase: ClientProjectSetupUseCase;
  configWritePort: RecordingConfigWritePort;
  calendarSubscriptionPort: RecordingCalendarSubscriptionPort;
  triggerPort: RecordingTriggerPort;
} => {
  const configWritePort = new RecordingConfigWritePort();
  const calendarSubscriptionPort = new RecordingCalendarSubscriptionPort();
  const triggerPort = new RecordingTriggerPort();
  return {
    useCase: new ClientProjectSetupUseCase(
      configWritePort,
      calendarSubscriptionPort,
      triggerPort,
    ),
    configWritePort,
    calendarSubscriptionPort,
    triggerPort,
  };
};

describe('ClientProjectSetupUseCase', () => {
  it('writes every script property from the configuration', () => {
    const { useCase, configWritePort } = buildUseCase();

    useCase.execute(
      new SyncConfiguration('hub@example.com', 60, 'tag', 'title'),
    );

    expect(configWritePort.written).toEqual({
      HUB_CALENDAR_ID: 'hub@example.com',
      SYNC_DAYS: '60',
      MEETING_OK_TAG: 'tag',
      MEETING_OK_TITLE: 'title',
    });
  });

  it('subscribes to the hub calendar', () => {
    const { useCase, calendarSubscriptionPort } = buildUseCase();

    useCase.execute(
      new SyncConfiguration('hub@example.com', 60, 'tag', 'title'),
    );

    expect(calendarSubscriptionPort.subscribed).toEqual(['hub@example.com']);
  });

  it('installs the sync trigger exactly once', () => {
    const { useCase, triggerPort } = buildUseCase();

    useCase.execute(
      new SyncConfiguration('hub@example.com', 60, 'tag', 'title'),
    );

    expect(triggerPort.createdCount).toBe(1);
  });

  it('does not subscribe or install a trigger when the configuration is rejected', () => {
    const { useCase, calendarSubscriptionPort, triggerPort } = buildUseCase();

    expect(() =>
      useCase.execute(
        SyncConfiguration.create('hub@example.com', '0', 'tag', 'title'),
      ),
    ).toThrow('SYNC_DAYS must be a positive integer, received "0"');
    expect(calendarSubscriptionPort.subscribed).toEqual([]);
    expect(triggerPort.createdCount).toBe(0);
  });
});
