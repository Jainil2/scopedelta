# Production Operations

## Status and change boundary

Implemented through SC-012. This runbook covers the public lead flow,
production platform kernel, delivery/commercial/client/engineering/QA/AI
history, provider-neutral billing/entitlements, Paddle sandbox lifecycle, and
the production-oriented self-host path. It does not authorize production
credentials, database creation, DNS changes, live payments, a paid service,
public source release, or destructive database work without founder approval.
It does not cover OCR extraction, SSO, anonymous action links, legal
e-signature, live plan/pricing policy, or the final LIC-001 license boundary.

SC-011C adds migration `0019`, deployment-local activation/reliability signals,
non-destructive lifecycle requests, invitation delivery evidence, and membership
suspension. A lifecycle request is an intent record only: it does not disable a
workspace, delete data, or establish retention. Physical deletion remains a
Layer-8 design and approval boundary.

## Deployment-local product signals

Run `pnpm operations:signals` with `DATABASE_URL` configured to emit one
content-free JSON snapshot of activation funnel counts, unresolved billing/AI/
import/provider/email states, repeated denials, and pending lifecycle requests.
`--limit=N` is bounded to 1–200 rows per group. The command uses a fixed set of
aggregate queries and performs no outbound network call.

Signal rows may contain only workspace/subject IDs, allowlisted event/outcome/
safe-dimension values, counters, and timestamps. Never add pageviews, names,
emails, recipients, documents, prompts/results, comments, source code, message
bodies, or provider payloads.

SC-012 reconciles local signals into content-free incidents. Run
`pnpm operations:alerts` to recover expired AI reservations/stale alert claims,
remove expired action limits, and send SMTP only when `OPERATOR_ALERT_TO` is
configured. New/escalated incidents send promptly and unresolved incidents are
reminded after 24 hours. The Netlify function runs every 15 minutes. Alert SMTP
does not consume tenant managed-email allowance. Without a recipient,
reconciliation remains local and makes no outbound alert call.

Routine recovery screens must render the stable safe failure class, whether
authoritative state is unchanged/partially committed/preserved, retry policy,
and next action. They must not render raw provider errors. Successful retries
clear current blocking guidance; historical bounded evidence remains available.

## GA lifecycle and containment

- `pnpm lifecycle:process -- --operator-id UUID --workspace-id UUID --request-id UUID --action inspect|start-review|block|process|purge`
- `pnpm operations:signals -- --limit=200`
- `pnpm operations:alerts`
- `pnpm production:validate`

Lifecycle processing rechecks a completed non-expired owner export, managed
subscription state, and AI/import/GitHub/billing/email work in flight. It writes
operator audit evidence but never disables access or mutates authoritative
customer data. Purge always fails pending approved policy.

Containment uses reversible switches: disable AI, disconnect provider access,
leave Paddle live actions disabled/unconfigured, disable SMTP, or remove
`OPERATOR_ALERT_TO` while retaining local reconciliation. Repair configuration,
reconcile durable provider/billing/import/email state, then retry the explicit
idempotent action. See `docs/DATA_LIFECYCLE.md` and `docs/GA_READINESS.md`.

## Supported deployment shapes

### Managed application

Netlify remains the application host. Production is the merged `main` branch.
The GitHub `Production deploy` workflow applies migrations, then
performs a manual Netlify CLI deploy. Netlify receives only runtime credentials;
the direct migration credential exists only for the migration step. Automatic
Netlify production builds are skipped by `netlify.toml` so code cannot publish
before its migration. Branch/deploy previews still build and receive no
production database credentials.

PostgreSQL and SMTP remain provider-neutral. Neon Free is an optional managed
PostgreSQL reference and Resend Free is an optional SMTP reference; their SDKs
are not used. Confirm current limits and production suitability before relying
on a free tier, and do not attach billing without founder approval.

### Self-hosted

The `Dockerfile` builds a multi-stage Node.js 24 production image that runs as
the unprivileged `node` user. `compose.yaml` demonstrates the app, PostgreSQL
17, a one-shot migration service, and development-only Mailpit; secrets are
supplied from an untracked environment file. A production self-host must omit
Mailpit, persist PostgreSQL on protected storage, and
place the app behind a maintained reverse proxy that terminates TLS, redirects
HTTP to HTTPS, preserves the original host/scheme, and supplies a trustworthy
client-IP header.

Keep `DISTRIBUTION_MODE=self_host`; do not configure Paddle. Local/LAN core,
customer SMTP, and customer-hosted/BYO AI have no ScopeDelta Cloud entitlement
dependency. The complete initial deployment, upgrade, backup, restore, and
provider-independent verification procedure is in `docs/SELF_HOST.md`.

## Production environment

Set these runtime values only in the Netlify Production deploy context or the
self-host secret manager:

| Variable                                       | Requirement                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `APP_URL`                                      | Exact canonical HTTPS origin, no trailing slash.                   |
| `DATABASE_URL`                                 | Pooled runtime PostgreSQL URL with least-privilege app access.     |
| `BETTER_AUTH_SECRET`                           | At least 32 cryptographically random characters.                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`        | Transactional SMTP endpoint and TLS mode.                          |
| `SMTP_USER`, `SMTP_PASSWORD`                   | Set together when authentication is required.                      |
| `SMTP_FROM`                                    | Verified sender, for example `ScopeDelta <no-reply@example.com>`.  |
| `LEAD_WEBHOOK_URL`                             | Existing paid-pilot JSON receiver.                                 |
| `DISTRIBUTION_MODE`                            | `self_host` by default; `managed_cloud` only for configured cloud. |
| `BILLING_ENTRY_PLAN_KEY`, `BILLING_PLANS_JSON` | Managed-cloud plan and allowance catalog; server-only.             |
| `BILLING_GRACE_DAYS`                           | Configured payment-problem grace interval, 1–30 days.              |
| `MANAGED_AI`, `MANAGED_EMAIL`                  | Enable ScopeDelta-managed allowance enforcement.                   |
| `PADDLE_*`                                     | Sandbox-only API/webhook values; no live credentials.              |

Set these separately as GitHub Actions **repository secrets** used by
`.github/workflows/production-deploy.yml`. Repository secrets work for a
private repository on GitHub Free and do not require a paid GitHub environment:

| Secret                   | Requirement                                                                |
| ------------------------ | -------------------------------------------------------------------------- |
| `DATABASE_MIGRATION_URL` | Direct schema-owner URL; exposed only to the migration step.               |
| `NETLIFY_AUTH_TOKEN`     | Netlify user personal access token; exposed only to the deployment step.   |
| `NETLIFY_SITE_ID`        | Target ScopeDelta Netlify project identifier; this does not scope the PAT. |

GitHub repository secrets do not provide an environment approval gate or
environment-specific access control. Protect `main`, require review where the
repository plan permits it, restrict repository write access, and treat changes
to Actions workflows as privileged deployment changes. Pull requests from
forks do not receive repository secrets, and this deployment workflow runs only
after code reaches `main` or an authorized maintainer dispatches it. The
workflow uses the private repository's included GitHub Actions minutes; monitor
that quota and do not enable paid overages without founder approval.

Netlify CLI authentication uses a user-scoped personal access token. It may be
able to operate on every Netlify resource available to that user;
`NETLIFY_SITE_ID` selects the deployment target but does not reduce that
authority. Prefer a dedicated deployment identity limited to the ScopeDelta
team/site when that is available without an unapproved paid commitment.
Otherwise use the shortest practical token expiry, rotate it regularly and
after personnel/access changes, review Netlify access logs, and revoke it
immediately on suspected exposure.

Do not use `NEXT_PUBLIC_`. Keep production values out of commits, tickets,
screenshots, command history, and build output. Rotate `BETTER_AUTH_SECRET` only
as an incident operation: rotation invalidates sessions and may affect pending
tokens. Never configure `DATABASE_MIGRATION_URL` in Netlify. After any Netlify
runtime-environment change, run the production workflow again.

## PostgreSQL provisioning and permissions

1. Create a production PostgreSQL 17-compatible database in a founder-controlled
   project and region suitable for users and policy requirements.
2. Require TLS. Restrict network access where the host permits it.
3. Create separate runtime and migration credentials. Runtime needs DML access
   to application tables; the migration role needs schema-change rights and is
   not exposed to the running app.
4. Put the pooled endpoint in Netlify `DATABASE_URL` and the direct endpoint in
   GitHub Actions repository secrets as `DATABASE_MIGRATION_URL`. For Neon,
   use its pooled hostname for runtime and unpooled/direct hostname for
   migration and `pg_dump`.
5. Verify automated provider backups or configure the direct backup procedure
   below before accepting customer accounts.

Do not run migrations from multiple production jobs concurrently. GitHub
workflow concurrency makes `Production deploy` the single managed migration
runner; self-hosted releases run the migration image once before replacing
application containers.

## Migration release procedure

The durable CI/security contract and exact-SHA merge-candidate procedure are in
`docs/QUALITY_GATES.md`. CEO/product review may happen after focused validation;
it does not require the complete hosted gate first.

Before merging the functionally approved exact head:

1. Review generated SQL and verify it contains only the approved schema change.
2. Freeze ordinary feature scope and apply the `merge-candidate` label to the PR.
   The resulting PR event captures its exact 40-character head SHA and produces
   the branch-protection-compatible final check.
3. Require the full hosted gate to run `pnpm db:check` and apply the complete
   migration chain twice to a fresh disposable database.
4. Require integration/browser tests against migrated PostgreSQL, plus the
   production build, HTTP smoke, and container build.
5. Confirm `Full merge gate`, Sonar, GitGuardian, and both fast checks are green
   on the latest PR head. Any new commit invalidates the prior validation.
6. For future non-additive changes, document the expand/backfill/contract
   releases and restoration implications in the PR.

For managed production, the workflow maps `DATABASE_MIGRATION_URL` only into
the environment of `pnpm db:migrate`. The following Netlify CLI step receives
only `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, and a non-secret orchestration
marker.
If migration fails, deployment does not start. `netlify.toml` cancels any
automatic production build not carrying that marker, preventing the repository
integration from racing the workflow. Preview builds intentionally do not
validate a live production database.

For self-hosting:

```bash
docker compose --env-file .env.compose build
docker compose --env-file .env.compose run --rm migrate
docker compose --env-file .env.compose up -d app
```

Never edit a migration that has reached any shared environment. Fix forward
with a new migration.

### SC-005A migration `0003_delivery_core.sql`

This migration is additive: it creates delivery enums, eight tables, indexes,
scope constraints, and foreign keys. It does not rewrite or remove existing
identity, workspace, lead, or audit data. Apply it before deploying code that
serves client/project routes.

Before release, verify the migration twice on a fresh disposable PostgreSQL 17
database and run the delivery integration suite. The project-local work-number
counter starts at 1 for new projects; no backfill is required. If deployment of
the new application fails after migration, the previous application can run
against the additive schema. Leave the new structures in place and fix
forward—do not drop delivery tables or enum values in production.

Backups now include client/project names and summaries, work descriptions and
acceptance criteria, user attribution, target dates, labels, and dependency
structure. Treat the database backup as customer-confidential content. Audit
and application logs must continue to exclude those values.

### SC-005B migration `0004_planning_execution.sql`

This migration is additive: it creates the cycle lifecycle enum and `cycles`
table, adds the nullable `work_items.cycle_id` reference, and adds project/date
and work-item lookup indexes, including the cross-project assignee/status/target
index used by My work. It does not rewrite existing work items; every existing
item remains in the no-cycle backlog. Apply it before serving the board, cycle,
or My work routes.

Verify the migration twice on a fresh disposable PostgreSQL 17 database and run
the delivery integration suite. If the application deployment fails after the
migration, the prior SC-005A application can continue against the additive
schema. Leave the enum, table, column, and indexes in place and fix forward.

Cycle names, goals, dates, and work-item planning are customer-confidential
backup data. Operational and audit logs must contain only cycle IDs, lifecycle
transitions, and changed-field names. My work and board list requests remain
bounded to 100 rows per page; investigate execution plans before raising that
limit rather than compensating in the UI.

### SC-005C migration `0005_collaboration_context.sql`

This migration is additive. It creates enums and tables for comment revisions,
mentions, project notes, subscriptions, and in-app notifications, plus their
project/workspace scope constraints and bounded-read indexes. Existing projects
and work items need no backfill. Apply it before serving Brief, Activity,
work-item discussion, or Inbox routes. Reapplying it is safe through the normal
Drizzle journal; never edit the checked-in SQL after release.

If the new application fails after migration, the SC-005B application can
continue against the additive schema. Leave these structures in place and fix
forward. Backups now contain comment and project-note bodies and retained
comment revisions; treat them as customer-confidential content. Audit metadata
and operational logs may include only IDs, enum transitions, and changed-field
names—never comment/note text, work or project titles, labels, or email
addresses.

Comments, notes, activity, subscriptions, and the inbox require no outbound
provider. Do not configure SMTP jobs for collaboration notifications. Inbox and
activity requests default to 50 rows and cap at 100; comment history caps at
100 revisions and project notes cap at 20 active records. Investigate indexes
and query plans before changing those limits. Discussion reads select at most
100 newest-first comments and may add at most one read-only parent context row
per selected reply. Mention directories use bounded name searches. Watcher
authorization and notification delivery use 100-user keyset batches rather
than truncating the valid project audience; monitor batch counts if a workspace
grows materially beyond the current 500-person target.

### SC-006A migration `0006_commercial_baseline.sql`

This migration is additive. It adds commercial source/parser enums, scope and
basis-link enums, a defaulted `work_items.purpose` column, and project-scoped
tables for source originals, baselines/versions, scope items/revisions,
evidence anchors, and work-to-scope basis links. Existing work remains
`unclassified`; no customer content is backfilled or inferred. Apply it before
serving Commercial routes or the provenance controls on work items.

The application stores immutable source bytes and normalized extracted text in
PostgreSQL. Protect primary storage, replicas, snapshots, dumps, and restored
test databases as customer-confidential document storage. Source bodies,
extracted text, scope titles/details, and excerpts must never be copied to logs,
audit metadata, tickets, fixtures, or release evidence. Audit events may contain
only project/source/revision/work IDs, enum states, sizes, and changed-field names.

Capacity is intentionally local and bounded: 5 MB per source, 100 sources per
project, 500 PDF pages, 500,000 extracted characters, 1,000 DOCX archive entries,
25 MB DOCX uncompressed content, and 500 scope items per baseline. Monitor
database and backup growth before raising any limit. Parser states are `ready`,
`needs_ocr`, and `failed`; image-only PDFs require a human fallback because this
release installs no OCR or external document service. PDF/DOCX parsing occurs in
the application process, so investigate repeated parser-limit failures rather
than increasing function memory or timeouts without evidence.

If the new application fails after migration, the SC-005C application can run
against the additive schema and ignores the defaulted purpose column and new
tables. Leave them in place and fix forward. Restore tests must verify that an
authorized manager can download an original, inspect extracted text, open the
baseline and scope history, and see work provenance after the database restore.

### SC-007 migration `0010_client_collaboration.sql`

This migration is additive. It creates project-scoped client participants and
hashed invitations, safe project profiles/items, immutable packet and
acceptance version chains, terminal actions, external discussion, and durable
client-collaboration notifications. It also adds a nullable client-participant
provenance reference to commercial requests. Existing requests and projects
need no backfill. Apply it after the SC-006 migrations and before serving
`/client` or `/api/v1/client`.

Review the composite project foreign keys, version uniqueness, terminal-action
uniqueness, and immutable-row triggers before release. Apply the full migration
chain twice to a fresh PostgreSQL 17 database, then run the client collaboration
integration and separate-context browser journey. If application deployment
fails after migration, the previous application can ignore these additive
structures; leave them in place and fix forward.

Invitation creation always returns a copyable fragment URL to the authorized
internal manager. SMTP runs only after commit and is optional. On invite email
failure, copy the existing URL while it remains valid or reissue the invitation,
which revokes the prior token and rotates to a new value. Notification delivery
state may be retried without modifying the durable business action. Never log
recipient addresses, token fragments, message bodies, packet/request text, or
SMTP/provider responses; fixed event names and identifiers are sufficient.

Client pages and APIs must retain `private, no-store`, no-index/no-follow/
no-archive, and no-referrer headers at the reverse proxy. Ongoing access requires
a verified session and an active project participant on every request. Restores
must preserve revoked participant attribution, packet/target version history,
terminal actions, discussion order, notification read/delivery state, and the
nullable client-request provenance reference.

### SC-008 migrations `0011_engineering_qa_delivery_evidence.sql` and `0012_verification_implementation_set.sql`

These additive migrations create internal engineering-provider, repository,
pull-request snapshot/link, verification, defect, and webhook-delivery state.
The follow-up makes the verification-to-implementation relationship explicit.
They store bounded provider metadata, not source, diffs, review bodies, CI logs,
tokens, or webhook payloads. Local QA/readiness remains usable without GitHub.

### SC-009 migrations `0013_ai_delivery_intelligence.sql` and `0014_ai_execution_route.sql`

These additive migrations create durable AI jobs, immutable attempts/usage,
bounded action mappings, and the snapshotted provider/model/base-URL route.
They contain customer-confidential context/results and must be protected in
primary storage, replicas, backups, and restored tests. API keys are not stored.
Existing delivery history requires no backfill.

### SC-010 migration `0015_subscription_cloud_economics.sql`

This additive migration creates provider-neutral workspace billing snapshots,
checkout attempts, sanitized provider-event processing evidence, and managed
usage reservations/settlements. It adds one nullable usage reference to AI
attempts. Existing workspaces are not assigned a public plan by SQL: the server
lazily initializes the explicitly configured entry/self-host entitlement while
holding the workspace lock. No project, membership, client, commercial, AI, or
audit history is rewritten or deleted.

Apply the full chain before serving billing routes. Verify duplicate and
out-of-order Paddle events, active-project/AI concurrency, grace/expiry, and
self-host mode against a disposable database. If application deployment fails,
the previous application ignores the additive structures; leave them in place
and fix forward.

Billing backups contain provider-safe customer/subscription/transaction
references and checkout URLs, plus plan keys, limits, usage counts, and event
hashes. They must never contain card details, Paddle API/webhook secrets, or
full provider payloads. Operational logs use fixed failure names only.

## SMTP and DNS readiness

Use a transactional sender and a company-controlled domain. Before enabling
self-service signup:

1. Verify the `SMTP_FROM` domain and publish provider-supplied SPF and DKIM
   records; add an appropriate DMARC policy and monitored reporting address.
2. Verify port, TLS mode, credentials, and server egress. Prefer TLS from the
   first byte (`SMTP_SECURE=true`) when the provider requires port 465;
   otherwise use the provider's documented STARTTLS port.
3. Send synthetic verification, reset, and invitation messages to controlled
   mailboxes and check delivered links use the exact `APP_URL` HTTPS origin.
4. Confirm bounce/complaint handling in the provider dashboard without adding
   message bodies or recipients to application logs.

Mailpit is development-only and must never be public or connected to production.

## First platform deployment

1. Obtain founder approval for the chosen PostgreSQL/SMTP projects and any DNS
   changes; do not change the current production site beforehand.
2. Provision and back up PostgreSQL, configure SMTP/DNS, and create secrets.
3. Add runtime variables in Netlify, explicitly excluding
   `DATABASE_MIGRATION_URL`. Do not add database or SMTP credentials to preview
   contexts.
4. Add the three deployment values above as GitHub Actions repository secrets.
   This is compatible with a private repository on GitHub Free and deliberately
   does not claim an environment approval gate. Protect `main` and tightly
   review workflow changes; if stronger deployment approval is later required,
   obtain founder approval for any plan or platform change first.
5. Merge `main`. Confirm `Production deploy` applies migrations before the
   manual Netlify deployment. The automatic Netlify production build should be
   reported as intentionally skipped.
6. Run the verification checklist below with synthetic identities and no
   customer content.
7. Record only pass/fail evidence and sanitized identifiers in the release/PR.

## Release verification

### AI provider operations

- Keep `AI_ENABLED=false` until one provider/model, privacy terms, credentials,
  limits, and data location are approved for the deployment.
- Configure only the selected provider credential. Removing or rotating it
  causes explicit job failure; ScopeDelta does not fail over.
- Keep hosted API keys and Ollama endpoints server-only. Never expose an Ollama
  port to an untrusted LAN or the public internet without authenticated network
  controls.
- Review `ai_job_attempts` usage/duration and failure codes without copying
  stored customer context/results into logs or tickets.
- An expired runner lease is a recoverable failed job. Diagnose the runtime,
  then let an authorized user retry explicitly; do not mutate attempts or bulk
  requeue jobs.
- To stop new inference safely, set `AI_ENABLED=false` and redeploy. Existing
  PostgreSQL results remain internal history; queued jobs become explicit
  retryable failures without making provider calls.
- Before changing providers, models, or base URLs, document the new
  processor/privacy boundary and complete or cancel existing jobs. A queued
  job fails closed when its approved route differs; an authorized retry
  explicitly resnapshots the repaired route. Do not operate overlapping
  fallback keys.
- Use `pnpm ai:eval` only with synthetic fixtures and an intentionally selected
  model. The repository never downloads Ollama models automatically.

### Billing sandbox operations

- Do not set `PADDLE_ENVIRONMENT` to live. The adapter accepts only sandbox API
  keys beginning `pdl_sdbx_`, the canonical `https://sandbox-api.paddle.com` API
  origin, and a `PADDLE_HOSTED_CHECKOUT_URL` copied from
  `https://sandbox.pay.paddle.io/checkout/hsc_...`. SC-010 authorizes no live
  account, fees, or customer money.
- Create the sandbox hosted checkout in Paddle and configure its completion
  redirect back to ScopeDelta. ScopeDelta appends the server-created
  `transaction_id`; it never sends buyers to an application page that lacks a
  payment form.
- Configure plan JSON only in the server secret/configuration boundary. Never
  expose Paddle API/webhook secrets through `NEXT_PUBLIC_`, browser payloads,
  database rows, screenshots, or logs.
- Configure the Paddle notification destination for
  `/api/v1/billing/paddle/webhook`. Signature verification uses the exact raw
  body, the destination-specific secret, HMAC-SHA256, and timestamp tolerance.
- A checkout browser return changes no entitlement. Inspect the signed webhook,
  sanitized `billing_provider_events` state, and current workspace snapshot when
  a sandbox payment appears complete but access remains pending.
- Canceled-paid-through and expired workspaces may start a fresh checkout. The
  existing Paddle customer is reused, and a different subscription ID is
  accepted only when its webhook carries the exact still-open workspace/plan
  checkout-attempt binding.
- Duplicate event IDs are normal and idempotent. Older events are recorded as
  ignored and cannot regress a newer subscription. Rejected workspace/customer/
  subscription/price mappings require configuration investigation; never edit
  the event into `processed` manually.
- A checkout stuck in `creating` is deliberately fail-closed because Paddle
  does not accept a generic idempotency key. Reconcile the provider transaction
  and local attempt before allowing another checkout; do not delete the attempt
  merely to retry.
- Payment problems enter configured grace. Existing history remains readable.
  Do not delete projects or customer history because a subscription expires.
- Use `pnpm billing:economics` for bounded content-free unit-economics evidence.
  Apply provider price data outside the authoritative domain; never write token
  price tables into entitlement state.
- Alert operationally on persistent `failed`/`rejected` billing events, growing
  `creating` checkout attempts, reserved usage that outlives the AI lease window,
  and repeated managed-email/AI allowance denials. Layer 6 records evidence but
  does not authorize a paid observability commitment.

- Public `/` returns 200 and the existing paid-pilot flow remains usable.
- A new synthetic account receives one verification email; unverified sign-in
  is rejected without account-enumeration detail.
- Verification opens onboarding; workspace creation emits a stable slug and
  opens `/app/[workspaceSlug]`.
- Reload, sign-out, and re-login preserve workspace access.
- A second workspace appears in the switcher.
- Owner/member/admin restrictions match the documented role matrix and the last
  owner cannot be removed or demoted.
- An invitation token is in the URL fragment, disappears after staging, and is
  accepted only by a verified matching email.
- Password recovery succeeds and prior sessions are revoked.
- Desktop and mobile shell layouts are keyboard-operable with visible focus.
- A manager can preserve a synthetic pasted/PDF/DOCX source, create baseline v1,
  anchor one scope item, classify work, link its basis, and see linked advisory
  drift without exposing the source to a regular project member.
- An image-only synthetic PDF reports `needs_ocr`; its original remains
  downloadable to an authorized manager and no document text appears in logs.
- Browser console and Netlify logs contain no secrets, tokens, names, emails,
  message bodies, provider responses, or customer content.

## Logging and incident-safe diagnostics

Application logs use fixed technical event names only. Never add raw request
bodies, headers/cookies, SQL values, auth responses, SMTP envelopes, invitation
URLs, webhook payloads, or exception objects that may contain provider data.
API failures expose stable public codes, not database/provider details.

For an incident, correlate by timestamp, route, HTTP status, and sanitized audit
event UUID/type. Query tenant/customer content only with explicit authorization
and the minimum scope necessary.

## Backup and restore

Use the direct connection and a secure operator environment. Never place a
password inline in a shared command or committed script.

```bash
pg_dump --dbname="$DATABASE_MIGRATION_URL" --format=custom --no-owner --file=scopedelta-UTC_TIMESTAMP.dump
pg_restore --list scopedelta-UTC_TIMESTAMP.dump
```

Encrypt backups, restrict access, and store them outside the primary database
project according to the approved retention policy. Test restore into a new,
isolated database regularly:

```bash
createdb scopedelta_restore_test
pg_restore --dbname=postgresql://.../scopedelta_restore_test --no-owner --clean --if-exists scopedelta-UTC_TIMESTAMP.dump
```

Point a non-production application at the restored database and perform the
release verification. Never use `--clean` against production. A production
restore is destructive and requires founder approval, an incident plan, and an
explicitly resolved target.

## Rollback and recovery

Schema rollback is forward-only. If a migration fails before publish, fix the
migration code and rerun; do not partially publish the app. If the application
fails after an additive migration, restore the last known-good Netlify deploy
only if its schema contract remains compatible, then ship a forward fix through
a PR. Do not force-push `main` or manually delete schema objects.

To disable new identity traffic during an auth/email incident, stop production
publishing and use Netlify access controls or unpublish the site; removing SMTP
configuration causes safe delivery failure but is not a complete signup lock.
To disable only paid-pilot intake, remove `LEAD_WEBHOOK_URL` and redeploy. Keep
projects and data intact for investigation rather than deleting them.

## Existing lead receiver boundary

The lead endpoint sends the versioned `pilot_interest.submitted` event with an
idempotency key, eight-second timeout, no redirect following, and no automatic
retry. It persists no lead data. The configured receiver remains an independent
privacy/retention boundary. Review and delete synthetic checks, deduplicate by
submission UUID, and never inspect lead bodies in Netlify logs.
