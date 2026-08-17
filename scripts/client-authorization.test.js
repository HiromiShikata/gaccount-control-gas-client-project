const {
  AUTHORIZATION_SCOPES,
  clientAuthCreate,
  consentUrlCreate,
  tokenRequestBodyCreate,
} = require('./client-authorization');

describe('AUTHORIZATION_SCOPES', () => {
  it('requests exactly the four scopes the deployment needs', () => {
    expect(AUTHORIZATION_SCOPES).toEqual([
      'https://www.googleapis.com/auth/script.projects',
      'https://www.googleapis.com/auth/script.deployments',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ]);
  });

  it('never requests a Google Cloud scope, whose token cannot refresh unattended', () => {
    expect(
      AUTHORIZATION_SCOPES.some((scope) => scope.includes('cloud-platform')),
    ).toBe(false);
  });
});

describe('consentUrlCreate', () => {
  const url = () =>
    new URL(consentUrlCreate({ clientId: 'the-client', redirectPort: '8123' }));

  it('addresses the Google authorization endpoint', () => {
    expect(url().origin + url().pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
  });

  it('asks for an authorization code for the given client', () => {
    expect(url().searchParams.get('client_id')).toBe('the-client');
    expect(url().searchParams.get('response_type')).toBe('code');
  });

  it('redirects to the loopback address on the given port', () => {
    expect(url().searchParams.get('redirect_uri')).toBe(
      'http://localhost:8123',
    );
  });

  it('forces a refresh token to be issued', () => {
    expect(url().searchParams.get('access_type')).toBe('offline');
    expect(url().searchParams.get('prompt')).toBe('consent');
  });

  it('carries the four scopes separated by spaces', () => {
    expect(url().searchParams.get('scope')).toBe(
      AUTHORIZATION_SCOPES.join(' '),
    );
  });
});

describe('tokenRequestBodyCreate', () => {
  const body = () =>
    new URLSearchParams(
      tokenRequestBodyCreate({
        clientId: 'the-client',
        clientSecret: 'the-secret',
        redirectPort: '8123',
        code: 'the-code',
      }),
    );

  it('exchanges the authorization code for tokens', () => {
    expect(body().get('grant_type')).toBe('authorization_code');
    expect(body().get('code')).toBe('the-code');
  });

  it('repeats the client and redirect the consent URL used', () => {
    expect(body().get('client_id')).toBe('the-client');
    expect(body().get('client_secret')).toBe('the-secret');
    expect(body().get('redirect_uri')).toBe('http://localhost:8123');
  });
});

describe('clientAuthCreate', () => {
  it('produces the object stored as the account secret', () => {
    expect(
      clientAuthCreate({
        clientId: 'the-client',
        clientSecret: 'the-secret',
        tokenResponseBody: JSON.stringify({
          access_token: 'ignored',
          refresh_token: 'the-refresh-token',
        }),
      }),
    ).toEqual({
      client_id: 'the-client',
      client_secret: 'the-secret',
      refresh_token: 'the-refresh-token',
    });
  });

  it('fails when the response carries no refresh token', () => {
    expect(() =>
      clientAuthCreate({
        clientId: 'the-client',
        clientSecret: 'the-secret',
        tokenResponseBody: JSON.stringify({ access_token: 'only-this' }),
      }),
    ).toThrow('Authorization response contained no refresh token');
  });

  it('fails when the response is not JSON', () => {
    expect(() =>
      clientAuthCreate({
        clientId: 'the-client',
        clientSecret: 'the-secret',
        tokenResponseBody: 'not json',
      }),
    ).toThrow();
  });
});
