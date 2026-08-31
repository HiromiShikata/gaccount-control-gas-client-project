import { CalendarAppCalendarPort } from './adapters/CalendarAppCalendarPort';
import { CalendarAppCalendarSubscriptionPort } from './adapters/CalendarAppCalendarSubscriptionPort';
import { GasLogPort } from './adapters/GasLogPort';
import { ScriptAppTriggerPort } from './adapters/ScriptAppTriggerPort';
import { ScriptPropertiesConfigPort } from './adapters/ScriptPropertiesConfigPort';
import { ScriptPropertiesConfigWritePort } from './adapters/ScriptPropertiesConfigWritePort';
import { SyncConfiguration } from './domain/entities/SyncConfiguration';
import { CalendarHoldMirrorSyncUseCase } from './domain/usecases/CalendarHoldMirrorSyncUseCase';
import { ClientProjectSetupUseCase } from './domain/usecases/ClientProjectSetupUseCase';
import { MeetingBufferSyncUseCase } from './domain/usecases/MeetingBufferSyncUseCase';

declare const CLIENT_SETUP_CONFIG: {
  hubCalendarId: string;
  syncDays: string;
  meetingOkTag: string;
  meetingOkTitle: string;
};

function sync(): void {
  const now = new Date();
  const calendarPort = new CalendarAppCalendarPort();
  const configPort = new ScriptPropertiesConfigPort(
    PropertiesService.getScriptProperties(),
  );
  const logPort = new GasLogPort();
  const ownDomain = Session.getActiveUser().getEmail().split('@')[1];
  new CalendarHoldMirrorSyncUseCase(calendarPort, configPort, logPort).execute(
    now,
    ownDomain,
  );
  new MeetingBufferSyncUseCase(calendarPort, configPort, logPort).execute(now);
}

function createTrigger(): void {
  new ScriptAppTriggerPort().createSyncTrigger();
}

function setup(): void {
  const useCase = new ClientProjectSetupUseCase(
    new ScriptPropertiesConfigWritePort(
      PropertiesService.getScriptProperties(),
    ),
    new CalendarAppCalendarSubscriptionPort(),
    new ScriptAppTriggerPort(),
  );
  useCase.execute(
    SyncConfiguration.create(
      CLIENT_SETUP_CONFIG.hubCalendarId,
      CLIENT_SETUP_CONFIG.syncDays,
      CLIENT_SETUP_CONFIG.meetingOkTag,
      CLIENT_SETUP_CONFIG.meetingOkTitle,
    ),
  );
}

declare const global: {
  sync: typeof sync;
  createTrigger: typeof createTrigger;
  setup: typeof setup;
};
global.sync = sync;
global.createTrigger = createTrigger;
global.setup = setup;
