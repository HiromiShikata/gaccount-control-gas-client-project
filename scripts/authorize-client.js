const https = require('https');
const {
  clientAuthCreate,
  consentUrlCreate,
  tokenRequestBodyCreate,
} = require('./client-authorization');

const REQUIRED_VARIABLES = [
  'OAUTH_CLIENT_ID',
  'OAUTH_CLIENT_SECRET',
  'OAUTH_REDIRECT_PORT',
];

const missing = REQUIRED_VARIABLES.filter(
  (name) => process.env[name] === undefined || process.env[name] === '',
);
if (missing.length > 0) {
  console.error(
    `Missing required environment variables: ${missing.join(', ')}`,
  );
  process.exit(1);
}

const request = (options, body) =>
  new Promise((resolve, reject) => {
    const clientRequest = https.request(options, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => (responseBody += chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode, body: responseBody }),
      );
    });
    clientRequest.on('error', reject);
    clientRequest.write(body);
    clientRequest.end();
  });

const tokenExchange = async (code) => {
  const body = tokenRequestBodyCreate({
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    redirectPort: process.env.OAUTH_REDIRECT_PORT,
    code,
  });
  const response = await request(
    {
      host: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
  );
  if (response.status !== 200) {
    throw new Error(
      `Authorization code exchange failed with status ${response.status}`,
    );
  }
  try {
    return clientAuthCreate({
      clientId: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      tokenResponseBody: response.body,
    });
  } catch (error) {
    throw new Error(
      `${error.message}, in a response with status ${response.status}`,
    );
  }
};

const run = async () => {
  const [subcommand, code] = process.argv.slice(2);
  if (subcommand === 'url') {
    console.log(
      consentUrlCreate({
        clientId: process.env.OAUTH_CLIENT_ID,
        redirectPort: process.env.OAUTH_REDIRECT_PORT,
      }),
    );
    return;
  }
  if (subcommand === 'exchange') {
    if (code === undefined || code === '') {
      throw new Error('The exchange subcommand requires an authorization code');
    }
    console.log(JSON.stringify(await tokenExchange(code)));
    return;
  }
  throw new Error('Usage: authorize-client.js url | exchange <code>');
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
