# Calendar Hold Mirror

A parameterized Google Apps Script that mirrors free/busy availability between an
account's own calendar and a shared hub calendar using `[HOLD]` placeholder
events, so no event details are exposed. This is the single canonical script for
every account; all environment-specific values are read from Script Properties at
runtime, so the same code runs unmodified everywhere.

## What it does

`sync()` runs on a 15-minute time-based trigger over a window from now to
now + `SYNC_DAYS` days:

- Push: for each of the account's own timed events, skipping all-day events,
  events already tagged `[HOLD]`, and declined events, a placeholder titled
  `[HOLD] {ownDomain} {originalTitle}` is reconciled onto the hub calendar.
  Placeholders have their reminders removed and are marked busy (opaque).
- Pull: for each hub timed event, skipping all-day events, this domain's own
  holds, and declined events, a `[HOLD]` placeholder is reconciled onto the
  account's own calendar. When the hub event title contains the configured
  meeting-ok tag, the configured meeting-ok placeholder title is used instead.

`{ownDomain}` is derived at runtime from the active user's email address.
Reconciliation deletes stale placeholders and creates missing ones; the
deduplication key is start time, end time, and title.

## Architecture

- `src/domain/entities` — the reconciliation decision logic as pure entities and
  functions with no Apps Script dependency, exhaustively unit-tested.
- `src/domain/usecases` — orchestrates push then pull through injected ports.
- `src/domain/usecases/adapter-interfaces` — the calendar, config, and log ports.
- `src/adapters` — the ports implemented over `CalendarApp`, `PropertiesService`,
  and the runtime log.
- `src/Code.ts` — the entry file, which exposes `sync` and `createTrigger` on the
  global object.

## Configuration (Script Properties)

Set these on the Apps Script project (Project Settings, Script Properties). A
required value that is absent is logged and the run is skipped; there is no
silent fallback to a hardcoded value.

- `HUB_CALENDAR_ID` — the shared hub calendar id.
- `SYNC_DAYS` — the forward window length in days (a positive integer).
- `MEETING_OK_TAG` — the opt-in meeting-ok tag matched in hub event titles.
- `MEETING_OK_TITLE` — the placeholder title used for meeting-ok hub events.

The values are written by `setup`, so they are not entered by hand. `sync` reads
them at runtime and skips the run when one is absent.

## Client setup

`setup` performs the three project-side operations in one call: it writes the
Script Properties, subscribes the account to the hub calendar, and installs the
15-minute trigger for `sync`. It reads its values from `CLIENT_SETUP_CONFIG`,
which `npm run generate:client-setup-config` writes into `dist` from environment
variables, so no account-specific value is committed to this repository.

`setup` replaces the `sync` triggers the project already has instead of adding to
them, so running it again on a project that is already set up leaves exactly one
15-minute trigger rather than doubling the sync frequency.

Each client account needs its own credentials. One credential cannot serve
several accounts, and no service account is involved, so a client whose
organisation does not allow service accounts is still supported. The account is
identified by the `CLIENT_AUTH_{KEY}` and `SCRIPT_ID_{KEY}` secret pair that the
matrix key selects, never by inference.

The authorization the account grants MUST NOT include the `cloud-platform`
scope. A Google Workspace whose administrator has set a Google Cloud session
length rejects the unattended token refresh of any token carrying that scope,
answering `invalid_grant` with `error_subtype: rapt_required`, which only a human
re-authentication can clear. Requesting `script.projects`, `script.deployments`,
`drive.file` and `userinfo.email` alone keeps the refresh unattended and is
sufficient for the Apps Script content API this project pushes with. Those four
scopes are the ones `scripts/client-authorization.js` fixes in the source, so the
authorization command cannot request a Google Cloud scope. `clasp login` always
requests `cloud-platform`, so its credentials MUST NOT be used for the
deployment.

1. Install dependencies: `npm install`.
2. Signed in as the client account, enable the Apps Script API at
   https://script.google.com/home/usersettings .
3. Print the consent URL with
   `OAUTH_CLIENT_ID=... OAUTH_CLIENT_SECRET=... OAUTH_REDIRECT_PORT=... npm run authorize:client url`,
   open it, and sign in as the client account. The URL can be opened on another
   device, so the sign-in — including the password and the second factor — can be
   completed on a phone; the redirect to the loopback address then fails to load
   and the authorization code is read out of the address bar. Exchange it with
   `npm run authorize:client exchange <code>`, which prints the JSON object to
   store as `CLIENT_AUTH_{KEY}`. The scopes are fixed in the source, so the
   `cloud-platform` scope cannot be requested by mistake. The printed object
   contains a refresh token, so it goes straight into the repository secret and
   MUST NOT be written to a file in this repository.
4. Create the Apps Script project for the account and note its script id.
5. Bundle, generate the setup config, and push:
   `npm run bundle && HUB_CALENDAR_ID=... SYNC_DAYS=... MEETING_OK_TAG=... MEETING_OK_TITLE=... npm run generate:client-setup-config && CLIENT_AUTH='{"client_id":"...","client_secret":"...","refresh_token":"..."}' SCRIPT_ID=... npm run push:client`.
6. Run `setup` once from the Apps Script editor and grant the calendar scope on
   the consent screen.
7. Grant the account write access to the hub calendar.
8. Register `CLIENT_AUTH_{KEY}` and `SCRIPT_ID_{KEY}` as repository secrets and
   add the key to `CLIENT_KEYS`, so later updates reach this account
   automatically.

## Updating every client project

`.github/workflows/deploy-clients.yml` pushes the current bundle to every
registered project when `main` changes, and on manual dispatch. Each project is
a separate matrix job, so one failing account does not stop the others.

The push replaces the target project's entire file set with the bundle, so a
file that exists only inside a client project is removed by the next run. This
is what makes every registered account converge on the same script, and it means
a project MUST NOT be edited by hand once it is registered.

The workflow reads these repository secrets. Account addresses and script ids
are never committed; the repository refers to each account only by an opaque
key such as `C1`.

- `CLIENT_KEYS` — comma-separated opaque keys, for example `C1,C2,C3`.
- `CLIENT_AUTH_{KEY}` — a JSON object holding `client_id`, `client_secret` and
  `refresh_token` for that account, authorized without the `cloud-platform`
  scope.
- `SCRIPT_ID_{KEY}` — the Apps Script project id for that account.
- `SETUP_HUB_CALENDAR_ID`, `SETUP_SYNC_DAYS`, `SETUP_MEETING_OK_TAG`,
  `SETUP_MEETING_OK_TITLE` — the values written into `CLIENT_SETUP_CONFIG`.

## Development

- `npm run build` — type check and build with `tsgo`.
- `npm run bundle` — bundle `src/Code.ts` into `dist/Code.js` for Apps Script.
- `npm run push:client` — push `dist` to one Apps Script project via the REST API.
- `npm run authorize:client url` — print the consent URL for one account.
- `npm run authorize:client exchange <code>` — exchange the authorization code
  and print that account's `CLIENT_AUTH_{KEY}` value.
- `npm run generate:client-setup-config` — write `dist/ClientSetupConfig.js`
  from the four environment variables listed above.
- `npm test` — run the unit tests. The non-interactive form is
  `CI=true npx jest --watchAll=false --ci`.
- `npm run format` — format the sources with Prettier.
