import { TriggerPort } from '../domain/usecases/adapter-interfaces/TriggerPort';

const SYNC_FUNCTION_NAME = 'sync';
const SYNC_INTERVAL_MINUTES = 15;

export class ScriptAppTriggerPort implements TriggerPort {
  createSyncTrigger(): void {
    ScriptApp.newTrigger(SYNC_FUNCTION_NAME)
      .timeBased()
      .everyMinutes(SYNC_INTERVAL_MINUTES)
      .create();
  }
}
