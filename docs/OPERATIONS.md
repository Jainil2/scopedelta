# Production Operations

## Status and change boundary

Accepted for SC-004. This runbook covers the existing public lead flow and the
production platform kernel. It does not authorize production credentials,
database creation, DNS changes, a paid service, or destructive database work
without founder approval. It does not cover SC-005 product data, AI, billing,
SSO, or client portals.

## Supported deployment shapes

### Managed application

Netlify remains the application host. Production is the merged `main` branch.
The production context applies migrations and then builds; branch/deploy
previews run only the build and receive no production database credentials.

PostgreSQL and SMTP remain provider-neutral. Neon Free is an optional managed
PostgreSQL reference and Resend Free is an optional SMTP reference; their SDKs
are not used. Confirm current limits and production suitability before relying
on a free tier, and do not attach billing without founder approval.

### Self-hosted

The `Dockerfile` builds a multi-stage Node.js 24 production image.
`compose.yaml` demonstrates the app, PostgreSQL 17, a one-shot migration
service, and development-only Mailpit. A production self-host must replace all
sample credentials, omit Mailpit, persist PostgreSQL on protected storage, and
place the app behind a maintained reverse proxy that terminates TLS, redirects
HTTP to HTTPS, preserves the original host/scheme, and supplies a trustworthy
client-IP header.

## Production environment

Set these only in the Netlify Production deploy context or the self-host secret
manager:

| Variable                                | Requirement                                                       |
| --------------------------------------- | ----------------------------------------------------------------- |
| `APP_URL`                               | Exact canonical HTTPS origin, no trailing slash.                  |
| `DATABASE_URL`                          | Pooled runtime PostgreSQL URL with least-privilege app access.    |
| `DATABASE_MIGRATION_URL`                | Direct PostgreSQL URL for migration/backup operations.            |
| `BETTER_AUTH_SECRET`                    | At least 32 cryptographically random characters.                  |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Transactional SMTP endpoint and TLS mode.                         |
| `SMTP_USER`, `SMTP_PASSWORD`            | Set together when authentication is required.                     |
| `SMTP_FROM`                             | Verified sender, for example `ScopeDelta <no-reply@example.com>`. |
| `LEAD_WEBHOOK_URL`                      | Existing paid-pilot JSON receiver.                                |

Do not use `NEXT_PUBLIC_`. Keep production values out of commits, tickets,
screenshots, command history, and build output. Rotate `BETTER_AUTH_SECRET` only
as an incident operation: rotation invalidates sessions and may affect pending
tokens. After any Netlify environment change, publish a new production deploy.

## PostgreSQL provisioning and permissions

1. Create a production PostgreSQL 17-compatible database in a founder-controlled
   project and region suitable for users and policy requirements.
2. Require TLS. Restrict network access where the host permits it.
3. Create separate runtime and migration credentials. Runtime needs DML access
   to application tables; the migration role needs schema-change rights and is
   not exposed to the running app.
4. Put the pooled endpoint in `DATABASE_URL` and the direct endpoint in
   `DATABASE_MIGRATION_URL`. For Neon, use its pooled hostname for runtime and
   unpooled/direct hostname for migration and `pg_dump`.
5. Verify automated provider backups or configure the direct backup procedure
   below before accepting customer accounts.

Do not run migrations from multiple production jobs concurrently. The Netlify
production build is the single managed migration runner; self-hosted releases
run the migration image once before replacing application containers.

## Migration release procedure

Before merging:

1. Review generated SQL and verify it contains only the approved schema change.
2. Run `pnpm db:check`.
3. Apply migrations twice to a fresh disposable database; both runs must pass.
4. Run integration/browser tests against that migrated database.
5. For future non-additive changes, document the expand/backfill/contract
   releases and restoration implications in the PR.

For Netlify production, `netlify.toml` runs `pnpm db:migrate && pnpm build` only
in the production context. If migration fails, the deploy must fail before new
code is published. Preview builds intentionally do not validate a live
production database.

For self-hosting:

```bash
docker compose build
docker compose run --rm migrate
docker compose up -d app
```

Never edit a migration that has reached any shared environment. Fix forward
with a new migration.

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
3. Add Production-context variables in Netlify. Do not add database or SMTP
   credentials to preview contexts.
4. Publish merged `main`. Confirm the migration step succeeds before the build.
5. Run the verification checklist below with synthetic identities and no
   customer content.
6. Record only pass/fail evidence and sanitized identifiers in the release/PR.

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
