# Production Operations

## Status and change boundary

Implemented through SC-007. This runbook covers the public lead flow, production
platform kernel, additive client-project backlog migration, and optional cycle
planning, internal collaboration, commercial-delivery graph, and client
collaboration migrations. It does not
authorize production credentials, database creation, DNS changes, a paid
service, or destructive database work without founder approval. It does not
cover OCR/AI extraction, billing, SSO, anonymous action links, or legal
e-signature.

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

## Production environment

Set these runtime values only in the Netlify Production deploy context or the
self-host secret manager:

| Variable                                | Requirement                                                       |
| --------------------------------------- | ----------------------------------------------------------------- |
| `APP_URL`                               | Exact canonical HTTPS origin, no trailing slash.                  |
| `DATABASE_URL`                          | Pooled runtime PostgreSQL URL with least-privilege app access.    |
| `BETTER_AUTH_SECRET`                    | At least 32 cryptographically random characters.                  |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Transactional SMTP endpoint and TLS mode.                         |
| `SMTP_USER`, `SMTP_PASSWORD`            | Set together when authentication is required.                     |
| `SMTP_FROM`                             | Verified sender, for example `ScopeDelta <no-reply@example.com>`. |
| `LEAD_WEBHOOK_URL`                      | Existing paid-pilot JSON receiver.                                |

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

The durable CI/security contract and exact-SHA dispatch procedure are in
`docs/QUALITY_GATES.md`. CEO/product review may happen after focused validation;
it does not require the complete hosted gate first.

Before merging the functionally approved exact head:

1. Review generated SQL and verify it contains only the approved schema change.
2. Freeze ordinary feature scope and manually dispatch the `CI` workflow against
   the PR branch with its exact 40-character head SHA.
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
