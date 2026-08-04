const fs = require('fs');
const path = require('path');

const REQUIRED_VARIABLES = [
  'HUB_CALENDAR_ID',
  'SYNC_DAYS',
  'MEETING_OK_TAG',
  'MEETING_OK_TITLE',
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

const config = {
  hubCalendarId: process.env.HUB_CALENDAR_ID,
  syncDays: process.env.SYNC_DAYS,
  meetingOkTag: process.env.MEETING_OK_TAG,
  meetingOkTitle: process.env.MEETING_OK_TITLE,
};

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
const outfile = path.join(distDir, 'ClientSetupConfig.js');
fs.writeFileSync(
  outfile,
  `var CLIENT_SETUP_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
  'utf8',
);
console.log(`Wrote ${outfile}`);
