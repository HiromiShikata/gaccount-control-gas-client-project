import { ConfigPort } from '../domain/usecases/adapter-interfaces/ConfigPort';

export class ScriptPropertiesConfigPort implements ConfigPort {
  constructor(readonly properties: GoogleAppsScript.Properties.Properties) {}

  getRequired(key: string): string {
    const value = this.properties.getProperty(key);
    if (value === null || value === '') {
      throw new Error(`Required Script Property "${key}" is not set`);
    }
    return value;
  }
}
