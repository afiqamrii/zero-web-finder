# Verification record

## Gmail and database recovery — 16 November 2026

The original paused ZeroFinder database was resumed through its existing Vercel Marketplace integration. Its 22 leads were backed up with `pg_dump`, restored into isolated in-memory PostgreSQL, and compared against the original baseline schema and complete original-field, ID, and note fingerprints. The baseline and additive migrations were then applied to the original database. All 22 original records and fingerprints remain unchanged. All 10 app tables and Prisma migration history have RLS enabled with no PUBLIC/anon/authenticated table grants; Prisma migration status still succeeds. Backups and reports stay in ignored `.local/backups/`.

The app's own Google OAuth client now has verified Gmail sending and read-only access for `afiqamri03@gmail.com`. Google publishing status is In production, and consent was renewed after that change. Google verification is a separate process and has not been claimed. Runtime credentials remain in private environment configuration and are excluded from Git and the container build context. No real email was sent. The owner chose to enter their real postal address privately in Settings; sending stays paused.

The Gmail callback now validates PKCE, state, expiry, one-use exchange, exact callback details, both scopes, and the owner identity before atomically saving credentials. Worker shutdown lets active requests drain, validates startup configuration, and uses `tini` for container child cleanup. A public `/privacy` page is linked from login; only its exact GET/HEAD path bypasses owner authentication.

Validation before hosted deployment: **158 tests in 18 files passed**, production Webpack build and TypeScript passed, worker checks passed, and full lint passed with the three existing legacy image warnings. The final suite includes migration-history access checks; a queue-ordering test now sets an explicit due time instead of relying on database/JavaScript clock equality. The recovery scripts were also independently reviewed. The existing free Render service is selected; no paid hosting was purchased. Its old unprotected deployment was suspended while the protected upgrade was prepared. Hosted runtime verification is recorded separately once complete.

Earlier sections below are historical phase records and their connection/deployment statements describe those phases only.

## Growth tools and local analysis — 16 November 2026

This follow-up adds usable workflows to the existing application. The interactive preview is a temporary, loopback-only workspace with disconnected sending accounts. A separate temporary instance is used for browser QA. No hosted database was migrated, no hosting was purchased, and no real email was sent.

| Area | Implemented result |
| --- | --- |
| Opportunity Studio | Five deterministic score components, explained evidence, research checklist, next actions, editable/copyable introductions and project briefs. The algorithm reads saved records, checks suppression and prior outreach, and makes no external AI or website requests. It scans the latest 500 updated open records and shows up to 100 recommendations with explicit coverage counts. |
| Sales pipeline | Accessible stage selectors, complete stage counts and estimated values, bounded cards with paginated expansion, task previews, search and priority filters. Moving to Won leaves collected revenue unchanged. |
| Follow-up tasks | Persisted personal tasks with MYT deadlines, overdue/today/upcoming/completed views, editing, completion, reopening, and guarded deletion. Stale edits are rejected and changes are logged transactionally. Tasks do not send messages. |
| CSV import | Write-free preview, row-specific validation, normalized email deduplication, replay-safe imported identities, and explicit commit. Existing records are preserved; imported emails stay unverified. The input is bounded to 200 rows and 120 KB. |
| Overview and navigation | Due-task summaries, exact-record keyboard search, two new workspaces, responsive layouts, and a local-analysis entry point. Pipeline panes and due views survive navigation and reload. |
| Query and loading work | Dashboard polling no longer fetches up to 40 unused messages or full lead research blobs. Settings load on first visit. Additive indexes support latest-record scans and normalized mailbox lookups. These are implementation improvements, not a measured production speedup percentage. |
| Reliability and accessibility | Streaming request-size limits; discarded previews after failed file selection; plain-text provenance notes; clean-settings rebasing while preserving dirty drafts; successful hidden saves clear stale warnings; explicit form-label associations keep populated textarea contents out of field labels. |

The two new migrations add `SalesTask`, constraints, RLS/private-role restrictions, and non-unique lookup indexes. Existing lead and outreach rows are preserved. Migration fixtures now discover and apply the complete sorted migration history after inserting a legacy lead at the original baseline.

The analysis score prioritizes work; it is not a sale probability, client budget, website audit, or promise of earnings. The app still needs a database connection to load saved records. Draft edits last until the analysis panel closes and must be copied to keep them.

### Final verification for the growth upgrade

- **129 tests passed in 15 files** against temporary PostgreSQL databases, pure algorithms, and component fixtures. The suite covers migration preservation/RLS/indexes, task stale writes and date boundaries, import replay and limits, analysis exclusions, and preview/live connection controls.
- The final production Webpack build and TypeScript checks pass. Full lint has zero errors and three pre-existing image warnings in unused legacy components; final changed-file lint also passes.
- `browser-check.mjs`, `workspace-check.mjs`, `lead-navigation-check.mjs`, and `growth-check.mjs` passed during this upgrade. The final growth run verified the complete import → verify → analyze/copy → task → stage → dashboard/search flow, with no browser runtime errors or page overflow at 390 px.
- Browser testing found and fixed populated textarea labels and an off-screen screen-reader label escaping the pipeline's scroll container. The board now establishes its own positioning boundary; horizontal column scrolling no longer widens the document.
- Desktop Opportunity Studio and the 390 px mobile pipeline were visually inspected. Final artifacts include `growth-report.json`, `growth-studio-desktop.png`, `growth-dashboard-desktop.png`, `growth-studio-mobile.png`, and `growth-pipeline-mobile.png` under ignored `test-results/`.
- The final core browser fixture observed dashboard responses of 74, 84, 57, 64, and 75 ms. These are small local-fixture timings, not a production benchmark or percentage speedup.
- Current credential-presence check: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` are absent from both environment files; `.local/launch` has no downloaded Google client file. The temporary preview now explicitly disables Gmail connection testing. No real Gmail connection or sending is claimed.

The earlier review below is retained as a separate phase; its statement that no schema changes were needed does not describe the new additive migrations above.

## UI and workflow review — 16 November 2026

This pass improves the existing application locally. It does not deploy, migrate the hosted database, connect paid services, or send real email. No database schema changes were needed. The unrelated nested checkout remains untouched.

### Findings and fixes

| Area | Problem found | Result |
| --- | --- | --- |
| Overview | Decorative content pushed useful work down the page; an enabled switch could look operational despite blockers. | Metrics appear first, followed by accurate automation status and next actions for replies, contact research, drafts, uncertain messages, and failed searches. |
| Navigation | Tabs were not addressable; refreshing or navigating Back could lose the current view. Priority lead buttons opened only the general list. | URL-based tabs and lead filters, direct record links, and tested Back/Forward behavior. |
| Lead exports | Export ignored search and filters. | CSV uses the same audience and sort order as the visible view, across pages. Exports above 10,000 matching records ask for narrower filters instead of silently truncating. |
| Lead editing | Changing an address retained its verification checkbox; duplicate emails could be added by editing. An old editor snapshot could overwrite a worker update. | Email edits reset verification, duplicate checks are consistent, reopening fetches a fresh record, and stale saves receive a conflict without discarding the draft. |
| Lead research | Existing business details could not be edited; paging could become empty after edits. | Editable business/contact details, quick views and sorting, stable ordering, and server-clamped pagination. |
| Campaign review | Approved previews recalculated a new audience instead of showing enrolled messages. Concurrent or stale actions could overwrite campaign state. | Frozen message previews, enrolled counts, explicit ongoing-audience details, reusable drafts, and guarded state transitions. |
| Email queue | Disabled or unchecked follow-ups at the front of a batch could block new introductions. | Eligibility is applied before the batch limit, with regressions covering starvation. |
| Gmail follow-ups | Follow-ups created new threads, weakening reply detection. | Original subject, thread ID, and reply headers are retained. Transport behavior is mocked in tests; live Gmail remains unverified. |
| Worker resilience | A Gmail reply-check failure also stopped business discovery. | Email stays paused for that pass while discovery can continue; the warning is visible and repeated identical errors do not flood activity. |
| Contact eligibility | Legacy mixed-case addresses could bypass suppression; missing sources and malformed bare addresses could reach later stages. | Case-insensitive exclusions, canonical new enrollments, source checks at enrollment/send, and single-mailbox validation before provider requests. |
| Settings | Refreshing settings remounted the form and could lose edits/save feedback. | Stable controlled drafts, retained settings while navigating within the workspace, persistent save feedback, schedule validation, and provider-specific connection guidance. |
| Delivery history | Only the latest 40 messages were visible, hiding older problems. Gmail acceptance could be confused with delivery. | Search and pagination across saved messages, attention/status filters, accurate acceptance counts, and explicit provider semantics. |
| Data loading | A filter change could briefly show previous results; old responses could overwrite the new view. | URL-keyed results, guarded abort handling, retry states, and stale-update messaging. |
| Accessibility/mobile | A click on dialog padding closed the editor; dialogs had no accessible name; field hints became part of the field name. Mobile menu focus could escape. | Named dialogs, safe backdrop handling, separate labels/descriptions, focus containment/restoration, Escape support, readable mobile lead cards, larger text, and improved contrast. |

### Verification for this pass

- **75 tests passed in nine files**, including temporary PostgreSQL integration tests and component tests. All provider sending is mocked.
- Production Webpack build and TypeScript pass. Full lint has zero errors and the same three retained legacy image warnings; the final changed-file lint passes.
- Database tests cover existing-lead preservation, filtered exports, stale edit rejection, campaign actions, queue selection, Gmail threading, malformed mailbox rejection, attention metrics, and paginated history containing messages older than the former 40-message limit.
- No full concurrency/load test or hosted Supabase/Render/Gmail verification was performed. Local PostgreSQL fixtures use one connection; transaction isolation is implemented, but a multi-connection race benchmark is not claimed.
- Browser evidence and final screenshots are saved in ignored `test-results/`. Fixture names, deal values, and payments are demonstrations, not actual clients or revenue.
- The original browser workflow, `lead-navigation-check.mjs`, and `workspace-check.mjs` all passed. The additional flows verified filtered CSV content, direct lead loading, email verification reset, settings persistence across tabs/save/refresh, delivery-filter reload, mobile focus containment/restoration, safe dialog padding, and no page overflow or browser runtime errors.
- Final desktop (1440 × 1100), mobile overview (390 × 844), and mobile lead-card screenshots were visually inspected. The last five small-fixture dashboard responses took **45, 43, 56, 43, and 42 ms**; these are local observations, not a production speedup claim.

The October checks below are retained as historical evidence; they are not a claim of a production launch.

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
