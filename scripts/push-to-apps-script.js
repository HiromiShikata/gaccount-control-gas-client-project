const fs = require('fs');
const path = require('path');
const https = require('https');
const { appsScriptContentCreate } = require('./apps-script-content');

const REQUIRED_VARIABLES = ['CLIENT_AUTH', 'SCRIPT_ID'];

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

const accessTokenCreate = async (credentials) => {
  const body = new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  }).toString();
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
    throw new Error(`Token refresh failed with status ${response.status}`);
  }
  const accessToken = JSON.parse(response.body).access_token;
  if (!accessToken) {
    throw new Error('Token refresh returned no access token');
  }
  return accessToken;
};

const contentUpdate = async (accessToken, scriptId, files) => {
  const body = JSON.stringify({ files });
  const response = await request(
    {
      host: 'script.googleapis.com',
      path: `/v1/projects/${scriptId}/content`,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
  );
  if (response.status !== 200) {
    throw new Error(
      `Apps Script content update failed with status ${response.status}`,
    );
  }
};

const run = async () => {
  const credentials = JSON.parse(process.env.CLIENT_AUTH);
  const distDir = path.join(__dirname, '..', 'dist');
  const fileNames = fs.readdirSync(distDir).sort();
  const files = appsScriptContentCreate(fileNames, (fileName) =>
    fs.readFileSync(path.join(distDir, fileName), 'utf8'),
  );
  const accessToken = await accessTokenCreate(credentials);
  await contentUpdate(accessToken, process.env.SCRIPT_ID, files);
  console.log(`Pushed ${files.length} files`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
