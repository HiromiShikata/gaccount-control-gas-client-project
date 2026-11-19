/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

type AppsScriptManifest = {
  dependencies?: {
    enabledAdvancedServices?: {
      userSymbol: string;
      serviceId: string;
      version: string;
    }[];
  };
};

const manifest = JSON.parse(
  readFileSync(join(__dirname, 'appsscript.json'), 'utf8'),
) as AppsScriptManifest;

describe('appsscript.json', () => {
  it('enables the advanced Calendar v3 service as Calendar', () => {
    expect(manifest.dependencies?.enabledAdvancedServices).toEqual(
      expect.arrayContaining([
        { userSymbol: 'Calendar', serviceId: 'calendar', version: 'v3' },
      ]),
    );
  });
});
