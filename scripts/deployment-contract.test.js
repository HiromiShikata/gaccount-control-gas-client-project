const fs = require('fs');
const path = require('path');

const repositoryRoot = path.join(__dirname, '..');

const readSource = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const packageJson = JSON.parse(readSource('package.json'));

describe('the interface the deployment project builds on', () => {
  it('exposes the npm scripts the deployment workflow runs', () => {
    expect(Object.keys(packageJson.scripts)).toEqual(
      expect.arrayContaining([
        'bundle',
        'generate:client-setup-config',
        'push:client',
      ]),
    );
  });

  it('keeps the setup config variable names the deployment workflow fills from its hub configuration', () => {
    const source = readSource('scripts/generate-client-setup-config.js');
    expect(source).toContain("'HUB_CALENDAR_ID'");
    expect(source).toContain("'SYNC_DAYS'");
    expect(source).toContain("'MEETING_OK_TAG'");
    expect(source).toContain("'MEETING_OK_TITLE'");
  });

  it('keeps the credential and target variable names the deployment workflow fills for each client', () => {
    const source = readSource('scripts/push-to-apps-script.js');
    expect(source).toContain("'CLIENT_AUTH'");
    expect(source).toContain("'SCRIPT_ID'");
  });
});
