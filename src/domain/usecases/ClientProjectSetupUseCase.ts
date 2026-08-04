import { SyncConfiguration } from '../entities/SyncConfiguration';
import { CalendarSubscriptionPort } from './adapter-interfaces/CalendarSubscriptionPort';
import { ConfigWritePort } from './adapter-interfaces/ConfigWritePort';
import { TriggerPort } from './adapter-interfaces/TriggerPort';

export class ClientProjectSetupUseCase {
  constructor(
    readonly configWritePort: ConfigWritePort,
    readonly calendarSubscriptionPort: CalendarSubscriptionPort,
    readonly triggerPort: TriggerPort,
  ) {}

  execute(configuration: SyncConfiguration): void {
    this.configWritePort.setAll(configuration.toScriptProperties());
    this.calendarSubscriptionPort.subscribe(configuration.hubCalendarId);
    this.triggerPort.createSyncTrigger();
  }
}
