# Verification record

Verified locally on 16 October 2026. This records implementation checks, not a production launch or revenue result.

## Automated checks

- `npm run test`: **28 passing tests in four files**. Database tests use temporary PGlite PostgreSQL with the original schema and the additive migrations; provider sends are mocked.
- `npm run build`: production Webpack compilation and TypeScript checks pass. The app includes the owner dashboard, login, and protected data/automation routes.
- `npm run lint`: zero errors; three existing image-optimization warnings remain in the retained legacy lead components. Those components are not mounted by the new dashboard.
- Launch follow-up: all 28 application tests passed again. `npm run test:worker` verifies the actual worker process starts, authenticates a request, exits unsuccessfully on a failed request, and does not log its secret. This check uses a temporary local HTTP server, without a real database or email provider.
- Original lead notes survive the migration fixture. RLS is enabled by the private-data migration. This does not verify the production database role or Supabase configuration.

Covered behaviors include draft approval, frozen sender/message settings, one-time audience preservation on resume, duplicate prevention, overlapping worker serialization, daily caps, pause/master switches, verified-contact eligibility, opt-out cancellation, signed webhook verification/replay handling, single follow-up creation, Gmail account identity, Gmail reply cancellation, and uncertain-send quarantine without automatic retries.

## Browser checks

`node scripts/preview.mjs` runs a production build with a temporary database and disconnected email credentials. `npm run test:browser` checks private access, login, lead create/edit, recorded revenue, campaign personalization, blocked unconfigured sending, queued discovery, the selected Gmail sender, activity, cross-origin rejection, mobile navigation, dialog Escape handling, overflow, and runtime errors.

Screenshots and machine-readable results are under ignored `test-results/`. Their business and revenue records are test fixtures, not real clients or earnings.

The final desktop check used 1440 × 1100 and mobile used 390 × 844. Both screenshots were visually inspected. Mobile navigation is hidden when closed, status cards stretch to their column, dialogs close with Escape, and no page overflow or runtime errors were found. The final five local dashboard requests took **29, 28, 25, 25, and 25 ms**.

## Public discovery check

`node scripts/discovery-check.mjs` exercised the real public Google Maps scraper through the authenticated app and temporary database, with sending disabled:

- Dental clinics in Petaling Jaya, no-website filter, limit one: completed in **4 seconds**, zero matching leads in the sampled listings.
- Tailors in Petaling Jaya, the same filter/limit: completed in **10 seconds**, **one lead saved**.

The initial dental search reached the 150-second timeout. Investigation found hidden copy/edit-hours controls matching the old broad click selector, causing repeated waits. The fix checks visibility, limits optional interaction time, and skips listings already displaying website links before opening detail pages. These are two observed searches, not a guarantee of coverage or timing for every location. No business was contacted. Reports are in `test-results/discovery-report.json` and `test-results/discovery-before.json`.

## Performance changes

Lead queries are paginated, dashboard aggregates are server-side, views load on demand, search is debounced, hidden browser tabs stop polling, and discovery runs through a persistent queue. The scraper blocks unnecessary image/font/media downloads and has a bounded browser lifetime. No external font request is needed to render the app.

Local response timings are recorded in `test-results/browser-report.json`. They use a small local database and are not production latency, load-test results, or a measured percentage improvement over the original app.

## Live setup still required

- Connect `afiqamri03@gmail.com` through the documented Google OAuth helper; add credentials privately to the server environment. No real Gmail token or test-send receipt was available in this run.
- Verify the migrations on a separate staging database, then apply to the intended hosted database with a restorable backup. The existing Supabase database was not changed.
- Set owner access secrets, business postal address, and the public HTTPS URL.
- Deploy to an always-on Node host with Chromium and start the worker. Validate heartbeat, restart recovery, public unsubscribe links, a real email receipt, and reply handling there.
- Review contact sources before marking emails verified, approve a campaign, and enable sending. Discovery alone does not authorize a new campaign or verify an email address.

Gmail records provider acceptance, not confirmed inbox delivery. Replies in a separate new thread and Gmail bounce notices need manual review. The optional Resend integration has mocked webhook coverage but has not been exercised against a live Resend account. Google Maps results and availability may change.

## Launch attempt — 16 October 2026

Read-only connection attempts to both configured Supabase endpoints failed with `tenant/user not found`. No database backup, schema inspection, baseline marking, or migration was performed. The current Session pooler hostname has been requested from the account owner.

The connected Codex Gmail account was verified as `afiqamri03@gmail.com`. Runtime OAuth client credentials and a refresh token are still missing. Local login and worker secrets were generated privately; no token or password was printed or committed.

The worker's CommonJS environment-loader import was corrected for Node.js 24. The supervisor now restarts a failed worker and allows shutdown time for active work. The paid Render Blueprint is prepared, but Render access and purchase approval are pending. Its platform validation, deployed shutdown behavior, and actual resource usage remain unverified.

Docker Desktop's Linux engine is unavailable in this environment, so the container build could not be exercised locally. The production Next.js build is a separate check and is not evidence that a container has deployed.

No deployment, production migration, paid service purchase, or client email occurred during implementation or the launch attempt. Existing unrelated nested checkout files were preserved.
