const { appsScriptContentCreate } = require('./apps-script-content');

const readSource = (fileName) => `source of ${fileName}`;

describe('appsScriptContentCreate', () => {
  it('maps the manifest to a JSON file named appsscript', () => {
    expect(appsScriptContentCreate(['appsscript.json'], readSource)).toEqual([
      { name: 'appsscript', type: 'JSON', source: 'source of appsscript.json' },
    ]);
  });

  it('maps a script file to SERVER_JS without its extension', () => {
    expect(appsScriptContentCreate(['Code.js'], readSource)).toEqual([
      { name: 'Code', type: 'SERVER_JS', source: 'source of Code.js' },
    ]);
  });

  it('keeps every file in the given order', () => {
    const content = appsScriptContentCreate(
      ['ClientSetupConfig.js', 'Code.js', 'appsscript.json'],
      readSource,
    );

    expect(content.map((file) => file.name)).toEqual([
      'ClientSetupConfig',
      'Code',
      'appsscript',
    ]);
  });

  it('rejects a file type Apps Script cannot hold', () => {
    expect(() => appsScriptContentCreate(['notes.txt'], readSource)).toThrow(
      'Unsupported Apps Script file: notes.txt',
    );
  });
});
