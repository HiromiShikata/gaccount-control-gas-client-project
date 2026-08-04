import { ConfigWritePort } from '../domain/usecases/adapter-interfaces/ConfigWritePort';

export class ScriptPropertiesConfigWritePort implements ConfigWritePort {
  constructor(readonly properties: GoogleAppsScript.Properties.Properties) {}

  setAll(values: Record<string, string>): void {
    this.properties.setProperties(values);
  }
}
