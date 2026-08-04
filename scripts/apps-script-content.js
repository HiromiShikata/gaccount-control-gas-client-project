const MANIFEST_FILE_NAME = 'appsscript.json';

const appsScriptContentCreate = (fileNames, readSource) =>
  fileNames.map((fileName) => {
    if (fileName === MANIFEST_FILE_NAME) {
      return {
        name: 'appsscript',
        type: 'JSON',
        source: readSource(fileName),
      };
    }
    if (fileName.endsWith('.js')) {
      return {
        name: fileName.slice(0, -'.js'.length),
        type: 'SERVER_JS',
        source: readSource(fileName),
      };
    }
    throw new Error(`Unsupported Apps Script file: ${fileName}`);
  });

module.exports = { appsScriptContentCreate, MANIFEST_FILE_NAME };
