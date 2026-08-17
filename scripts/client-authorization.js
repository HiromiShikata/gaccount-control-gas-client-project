const AUTHORIZATION_SCOPES = [
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

const redirectUriCreate = (redirectPort) => `http://localhost:${redirectPort}`;

const consentUrlCreate = ({ clientId, redirectPort }) =>
  `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriCreate(redirectPort),
    response_type: 'code',
    scope: AUTHORIZATION_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  }).toString()}`;

const tokenRequestBodyCreate = ({
  clientId,
  clientSecret,
  redirectPort,
  code,
}) =>
  new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUriCreate(redirectPort),
  }).toString();

const clientAuthCreate = ({ clientId, clientSecret, tokenResponseBody }) => {
  const refreshToken = JSON.parse(tokenResponseBody).refresh_token;
  if (!refreshToken) {
    throw new Error('Authorization response contained no refresh token');
  }
  return {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  };
};

module.exports = {
  AUTHORIZATION_SCOPES,
  clientAuthCreate,
  consentUrlCreate,
  tokenRequestBodyCreate,
};
