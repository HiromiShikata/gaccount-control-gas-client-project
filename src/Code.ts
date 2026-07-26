import { CalendarAppCalendarPort } from './adapters/CalendarAppCalendarPort';
import { GasLogPort } from './adapters/GasLogPort';
import { ScriptPropertiesConfigPort } from './adapters/ScriptPropertiesConfigPort';
import { CalendarHoldMirrorSyncUseCase } from './domain/usecases/CalendarHoldMirrorSyncUseCase';

function sync(): void {
  const useCase = new CalendarHoldMirrorSyncUseCase(
    new CalendarAppCalendarPort(),
    new ScriptPropertiesConfigPort(PropertiesService.getScriptProperties()),
    new GasLogPort(),
  );
  const ownDomain = Session.getActiveUser().getEmail().split('@')[1];
  useCase.execute(new Date(), ownDomain);
}

function createTrigger(): void {
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(15).create();
}

declare const global: {
  sync: typeof sync;
  createTrigger: typeof createTrigger;
};
global.sync = sync;
global.createTrigger = createTrigger;
