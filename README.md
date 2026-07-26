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

## Client setup

1. Install dependencies: `npm install`.
2. Create the Apps Script project and link it: copy `.clasp.json.example` to
   `.clasp.json` and set `scriptId` to your Apps Script project id (or run
   `npx clasp create --type standalone` and keep `"rootDir": "dist"`).
3. Bundle and push the code: `npm run bundle && npx clasp push`.
4. In the Apps Script project settings, add the Script Properties listed above.
5. Run `createTrigger` once from the Apps Script editor to install the
   15-minute trigger for `sync`.

## Development

- `npm run build` — type check and build with `tsgo`.
- `npm run bundle` — bundle `src/Code.ts` into `dist/Code.js` for Apps Script.
- `npm test` — run the unit tests. The non-interactive form is
  `CI=true npx jest --watchAll=false --ci`.
- `npm run format` — format the sources with Prettier.
