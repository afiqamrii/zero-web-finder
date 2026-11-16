# Zero Web Finder

A private growth workspace for Afiq Amri: discover businesses, qualify contacts, approve email campaigns, automate outreach, and track project revenue.

## What is included

- Overview with real lead counts, open pipeline value, recorded revenue, worker health, sending allowance, and recent activity.
- Searchable, paginated lead workspace with priorities, notes, contact verification, demo links, pipeline stages, CSV export, estimated deal value, and collected payments.
- Persistent, scheduled Google Maps discovery. Searches run in a worker rather than an open browser request. Rediscovery keeps your saved contact information and deal history.
- Personalized campaigns with explicit approval, frozen copy and sender details, audience filters, optional ongoing enrollment, pause/resume, and one optional follow-up.
- Gmail sending as **afiqamri03@gmail.com**, with conversation reply checks before follow-ups. Resend is an optional alternative provider.
- Global duplicate-contact protection, daily caps, Malaysia-time sending windows, unsubscribe suppression, activity logs, and protected owner access.
- Actionable overview with replies, contact research, draft campaigns, uncertain messages, and failed searches; automation status explains setup, paused sending, worker problems, hours, and daily limits.
- Lead quick views, sorting, filtered CSV exports, direct record links, editable business details, and stale-edit protection. Mobile leads use readable cards. Filters survive refresh and browser navigation.
- Searchable, paginated email history across all saved messages; reusable campaign drafts; settings drafts retained while navigating inside the workspace.
- Opportunity Studio: local, explainable scoring across five signals, research checklists, next actions, and editable introduction/project-brief drafts. It uses saved evidence without an external AI service or website requests.
- A pipeline board with stage controls, estimated deal values, and dated next steps. Personal tasks support Malaysia-time deadlines, overdue/today/upcoming views, completion, reopening, editing, and guarded deletion.
- CSV import with a write-free preview, row-level validation, duplicate detection, replay protection, and unverified contacts by default. Import up to 200 rows/120 KB at a time.
- Keyboard quick search (`Ctrl+K` or `Cmd+K`) for pages and saved businesses, dashboard follow-up reminders, and responsive layouts for the new views.

Revenue is entered from payments you collect. Pipeline value is an estimate. Neither is a promise of future income. Website-refresh scores are screening signals, not a technical audit.

## Start locally

Use Node.js 24 and install the locked dependencies:

```powershell
npm ci --legacy-peer-deps
npm run db:generate
npx playwright install chromium
```

Fill in the database connection settings from `.env.example` in the ignored `.env.local` file. Run `npm run launch:prepare` to generate any missing owner password and signing/worker secrets. It preserves existing nonempty values and never prints the generated secrets. Do not overwrite an existing environment file or commit credentials. For local use set `PUBLIC_APP_URL=http://localhost:3000`; real sending requires the hosted HTTPS URL so clients can unsubscribe.

After applying the database steps below:

```powershell
npm run dev
```

In a second terminal:

```powershell
npm run worker
```

Open http://localhost:3000 and sign in with `OWNER_PASSWORD`. Complete your business postal address in Settings. Sending starts disabled.

The supported Webpack option is used for development and production builds because this Windows environment's Turbopack CSS worker crashes. No source compatibility workaround or type-check bypass is used.

## Database upgrade — preserve existing leads

This repository previously had a Prisma schema but no migration history. Five migrations now provide the original baseline, an additive workspace upgrade, private-data access controls, sales tasks, and lookup indexes. The latest migrations add a table and indexes without rewriting existing leads or outreach history.

**Use a separate staging database or a restorable backup first. Do not reset or force-push a schema over an existing database.**

For a new, empty PostgreSQL database:

```powershell
npm run db:deploy
```

For an existing database that matches the original `Lead` schema, first inspect/compare that schema with `prisma/migrations/202610160001_baseline/migration.sql`. Once confirmed, mark only the original baseline as already applied:

```powershell
npx prisma migrate resolve --applied 202610160001_baseline
npm run db:deploy
```

Run these commands against the intended staging connection first, then the production connection only after checking the upgrade. The supplied local integration tests apply the baseline, insert a legacy lead, upgrade it, and verify the original note remains intact.

The private-data migration enables RLS and revokes public, `anon`, and `authenticated` table access. The application accesses PostgreSQL through its server-only Prisma connection. That database role must own the tables or have the required server privileges, including bypassing RLS. No browser database keys are used. This is a single-owner application, not a multi-tenant service.

Existing stages and notes are preserved. `CLOSED` remains a legacy stage; it does not automatically become a win or revenue. Existing emails remain unverified until you check them. The migration adds ranking indexes and backfills fit scores.

The existing Supabase database was **not migrated or modified during this implementation**.

## Connect afiqamri03@gmail.com privately

1. In a Google Cloud project, enable the Gmail API. Configure the OAuth consent screen for your own account and add `afiqamri03@gmail.com` as a test user if the application is in testing.
2. Create an OAuth **Web application** client. Add this exact authorized redirect URI: `http://127.0.0.1:53682/callback`.
3. Download the OAuth client's JSON into `.local/launch/google-client.json` and run `npm run gmail:import`. This validates the redirect URI and saves the client settings in ignored `.env.local` without printing them. Alternatively, put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `EMAIL_PROVIDER=gmail` there yourself. Keep the downloaded JSON private.
4. Run:

```powershell
npm run gmail:connect
```

5. Open the printed Google authorization link, select `afiqamri03@gmail.com`, and grant `gmail.send` and `gmail.readonly`. The helper checks the account identity and writes `GMAIL_REFRESH_TOKEN` directly into `.env.local`. It does not print the token or send any email.
6. Restart the app. Use **Settings → Test Gmail connection**. Set the same sender address and add your real business postal address.
7. For hosting, place the Google client ID, client secret, and refresh token in the host's private environment settings. Do not put them in browser-prefixed variables or share them in chat.

Google OAuth testing mode can issue refresh tokens with a limited lifetime. Check the Google consent-screen status and [Google's token lifetime rules](https://developers.google.com/identity/protocols/oauth2#expiration) before relying on unattended production sending.

Gmail confirms **acceptance**, not delivery to a client's inbox. The dashboard therefore does not invent Gmail delivery or open rates. Replies are read from the original Gmail conversation; read and answer them in Gmail. Reply checks rotate through at most 20 open conversations per worker run and stop after a bounded time. A follow-up can send only after its own conversation was checked in the current run. A reply in a separate new thread must be marked manually as Replied. Review Gmail bounce notices and mark those leads Do not contact.

Gmail does not provide the idempotency guarantee used by the Resend adapter. Any uncertain Gmail send is placed in **Review**, never blindly retried. Inspect Gmail Sent to reconcile it; the application preserves the message and does not automatically re-enroll that address.

## Daily workflow

1. In **Automations**, choose a business type and city; queue a one-time, daily, or weekly discovery search. The worker picks it up, or use **Run queue now**.
2. In **Lead workspace**, inspect each business and check the contact email against its source. Only verified contacts with a source can enter outreach.
3. In **Email campaigns**, choose an audience, write the message, and inspect personalized previews. One-time campaigns support up to 200 potential contacts; ongoing campaigns add at most 200 per worker pass. Suppressed and previously enrolled addresses are excluded.
4. Approve the campaign, then enable the master sending switch in Settings. Sending follows the daily cap and configured weekday/hour window in `Asia/Kuala_Lumpur`.
5. Record replies, calls, proposals, wins, losses, deal values, and actual collected payments. Replies, opt-outs, progressed stages, invalidated contacts, and changed email addresses stop follow-ups.

Use **Lead workspace → Import CSV** for an existing spreadsheet. Download the sample or paste comma-separated data with a `name` column; optional headings are `category`, `address`, `email`, `phone`, `website`, `source`, and `notes`. Preview first. The final import adds valid new rows and skips invalid/duplicate rows, preserving existing records. Sources are provenance notes. Website links are research candidates, not an assessment of quality.

Open **Opportunity studio** to prioritize saved leads and prepare a working brief or introduction. The score is an ordering heuristic, not a conversion probability or inferred client budget. It scans the 500 most recently updated open leads and shows up to 100 recommendations, with explicit coverage counts. Saved opt-outs and suppression are excluded; previous outreach and shared mailboxes hold new introductions. The algorithm needs no external AI, but the app still needs its database connection. Copy edited drafts before closing their panel.

Use **Pipeline & tasks** to move a deal and give its next step a due date. Tasks are internal reminders; they do not email clients. Moving a lead to Won leaves collected revenue unchanged. Record actual payments separately in the lead editor. The overview shows overdue tasks and tasks still due today in Malaysia time.

Changing sender identity or offer pauses active campaigns. Existing approved messages keep their original snapshot; create a new campaign to use new copy or identity. A one-time audience does not grow when a campaign resumes. With ongoing enrollment, approval also covers future verified leads matching the approved rules.

Pausing prevents the next worker action. A provider request already in progress cannot be recalled. At most ten sends are attempted per worker pass. Failed/uncertain attempts consume the daily allowance conservatively.

## Production and automation

This app needs an always-on Node process with Playwright/Chromium and PostgreSQL. A static host is insufficient. Free hosting that sleeps cannot guarantee unattended schedules.

```powershell
npm run build
npm run start:all
```

`start:all` runs the web app and the independent worker. The supervisor restarts a stopped worker after five seconds and forwards shutdown signals to both processes. The Docker image starts the supervisor directly. Apply migrations before starting the upgraded app. Chromium needs enough memory for search runs.

`render.yaml` is a sleeping free review configuration. `render.production.yaml` prepares one always-on Singapore web service with 1 CPU and 2 GB RAM, running both the dashboard and worker. The [listed web-service compute cost](https://render.com/pricing) is US$25/month before tax and additional usage. This is a proposed plan, not a purchased service. It uses the `codex/growth-launch` branch, keeps automatic deployments off, allows a 300-second shutdown window, and requires secrets through Render's private environment settings. Confirm the account's actual checkout price before provisioning.

The production Blueprint intentionally has no automatic migration command. First back up the existing database, restore it into an isolated staging database, inspect baseline compatibility, apply migrations there, and verify preserved records. Then take a fresh production backup and apply the same inspected migration sequence to production. Never mark the baseline applied merely because a `Lead` table exists. If the schema differs, resolve that difference first without resetting data.

After connecting Render, create a Blueprint using `render.production.yaml`, enter the private database/login/Gmail settings, and set `PUBLIC_APP_URL` to the service's assigned HTTPS URL. Keep the sending switch off during launch verification. Check owner login, protected routes, database reads, worker heartbeat, a small discovery job, opt-out links, and a controlled email to an address you own before enabling an approved client campaign.

Alternatively, run `npm run start` and `npm run worker` as separately supervised processes. `WORKER_APP_URL` selects the web app address; the default is `http://127.0.0.1:3000`. An external scheduler can POST to `/api/worker` with `Authorization: Bearer <CRON_SECRET>` every minute. That route is not public without the secret. The database lease serializes overlapping runs and survives process restarts. **Run queue now** is available only inside the authenticated dashboard.

`/api/health` reports web-process health. The dashboard worker heartbeat reports automation activity separately. Keep the database and app in nearby regions, use the appropriate Supabase connection pooler, and use a session/direct connection for migrations. No deployment has been performed by this implementation.

### Optional Resend provider

Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET`, and use a verified sender domain. Configure Resend to POST `email.delivered`, `email.bounced`, `email.complained`, and `email.failed` to `/api/webhooks/resend`. For automatic follow-ups also configure a receiving domain, `INBOUND_REPLY_DOMAIN`, and `email.received` events. Read those replies in the Resend receiving inbox.

Webhook signatures and replay IDs are verified. Bounces and complaints suppress future outreach. Resend retries use the same frozen payload and idempotency key, up to three attempts within 23 hours; after that the record moves to Review. The shorter window stays inside [Resend's 24-hour idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys). Provider changes do not reroute previously queued messages.

## Verification

```powershell
npm run test
npm run test:worker
npm run typecheck
npm run lint
npm run build
```

Tests use a temporary, loopback-only PGlite PostgreSQL database and mocked email sends. They never use the configured Supabase connection. Local networking permission is needed in a restricted Windows sandbox. The database bridge under `tests/` is only for tests, not production.

For an isolated production-build browser preview:

```powershell
node scripts/preview.mjs
```

In another terminal:

```powershell
npm run test:browser
npm run test:navigation
npm run test:workspace
npm run test:growth
```

The preview uses a random local password in ignored `.local/preview-access.json`, an in-memory database, and no real sender credentials. Its banner clearly labels it a test workspace. Stopping the preview discards its records. Browser screenshots and a report are saved under ignored `test-results/`.

For an interactive preview that updates as source files change, set `$env:PREVIEW_DEV='true'` before starting the preview. This uses Next.js's separate development output directory and can remain running during a production build. Run `node scripts/seed-preview.mjs` to add four clearly labelled fictional businesses and two tasks; it refuses a normal or sending-enabled workspace. Re-running it preserves existing matching samples.

For a separate QA instance, set `$env:PREVIEW_PORT='3101'` in both the preview and test terminals. Each non-default port gets its own ignored access file, so QA does not replace the password or data in the interactive preview on port 3100. All preview processes bind only to `127.0.0.1`.

The extra browser checks cover URL/filter navigation, matching CSV exports, direct lead links, verification reset after email edits, settings draft recovery, delivery views, keyboard navigation, and mobile layout. Fictional businesses added by these checks are only preview fixtures. The refined screenshots use `dashboard-refined-desktop.png`, `dashboard-refined-mobile.png`, and `leads-refined-mobile.png` in `test-results/`.

The growth check follows CSV preview/import and replay, contact verification, local analysis and copying drafts, task creation in MYT, completion/reopening, stage movement without invented revenue, dashboard task links, keyboard search, and mobile layouts. Its report is `test-results/growth-report.json`; screenshots start with `growth-`.

The optional `node scripts/discovery-check.mjs` performs two small public Google Maps searches through that isolated preview. It requires internet access, pauses the preview's queued searches first, and leaves sending disabled. It is separate from the offline test suite.

See `VERIFICATION.md` for the actual results and remaining live-service checks.

### Current launch handoff — 16 October 2026

- The saved Supabase application and session-pooler connections both return `tenant/user not found`. No production backup or schema change has been possible. Open the project's Connect panel and copy the current Session pooler details into the private environment; do not guess the pooler cluster suffix or reset the password on this error alone. See [Supabase's diagnosis](https://supabase.com/docs/guides/troubleshooting/tenant-or-user-not-found).
- Owner and worker secrets were generated in ignored `.env.local`. They still need to be entered into the selected hosting account.
- The Codex Gmail connection was confirmed as `afiqamri03@gmail.com`. The hosted application still needs its own OAuth client and refresh token, using the steps above. A Codex connector does not supply runtime credentials to this app.
- Render account connection and paid-plan approval are pending. The production Blueprint is prepared; no service was created or paid for.
- The business name/postal address and the first campaign still need completion/review in Settings and Email campaigns. Approval remains a per-campaign action; deployment does not approve campaign copy or switch on sending.
