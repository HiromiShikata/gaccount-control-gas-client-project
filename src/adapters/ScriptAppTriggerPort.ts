import { TriggerPort } from '../domain/usecases/adapter-interfaces/TriggerPort';

const SYNC_FUNCTION_NAME = 'sync';
const SYNC_INTERVAL_MINUTES = 15;

export class ScriptAppTriggerPort implements TriggerPort {
  deleteSyncTriggers(): void {
    ScriptApp.getProjectTriggers()
      .filter((trigger) => trigger.getHandlerFunction() === SYNC_FUNCTION_NAME)
      .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  }

  createSyncTrigger(): void {
    ScriptApp.newTrigger(SYNC_FUNCTION_NAME)
      .timeBased()
      .everyMinutes(SYNC_INTERVAL_MINUTES)
      .create();
  }
}
