const manifest = require('../src/appsscript.json');

describe('appsscript.json', () => {
  it('pins the OAuth scopes to exactly the three scopes the deployed projects grant', () => {
    expect(manifest.oauthScopes).toEqual([
      'https://www.googleapis.com/auth/script.scriptapp',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar',
    ]);
  });

  it('enables only the advanced Calendar v3 service, exposed as Calendar', () => {
    expect(manifest.dependencies.enabledAdvancedServices).toEqual([
      { userSymbol: 'Calendar', serviceId: 'calendar', version: 'v3' },
    ]);
  });
});
