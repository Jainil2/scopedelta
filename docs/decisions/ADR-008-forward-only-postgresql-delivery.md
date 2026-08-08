# ADR-008 — Forward-Only PostgreSQL Delivery

## Status

Accepted for SC-004 — 2026-08-07.

## Context

Managed Netlify deploys, preview builds, and self-hosted containers need one
safe schema contract. Pooled runtime connections are appropriate for serverless
traffic, while migrations and backups require a direct PostgreSQL session.
Preview builds must not gain production database access merely to compile.

## Decision

- Use pooled `DATABASE_URL` only for application runtime traffic.
- Use direct `DATABASE_MIGRATION_URL` for Drizzle migrations and operator
  backup/restore tooling.
- Commit immutable SQL in `db/migrations/`; never rewrite deployed history.
- Run migrations in a GitHub production workflow, then deploy through the
  pinned Netlify CLI. Store deployment values as GitHub Actions repository
  secrets so private repositories on GitHub Free are supported. Map the direct
  credential only into the migration step; never store it in Netlify or expose
  it to application Functions.
- Skip repository-triggered Netlify production builds so they cannot race the
  migrate-then-deploy workflow. Preview contexts continue to build without
  production database credentials.
- Run a one-shot migration container before a self-hosted app replacement.
- Deliver future changes through expand/backfill/contract releases and recover
  by forward fix rather than destructive down migrations.

## Consequences

Production schema changes are reviewable and portable, previews remain isolated
from production data, and the elevated role is absent from the running host.
Repository secrets do not provide a deployment approval gate, so operators must
protect `main`, restrict workflow write access, and review Actions changes as
privileged. The Netlify CLI token is a user-scoped personal access token rather
than a site-scoped credential; operators must minimize that user's access,
shorten and rotate the token, and ensure only one production migration runner
operates. An old application deploy may be restored only while additive schema
compatibility remains; otherwise a new forward fix is required.

## References

- `db/migrations/`
- `drizzle.config.ts`
- `netlify.toml`
- `.github/workflows/production-deploy.yml`
- `Dockerfile`
- `docs/OPERATIONS.md`
