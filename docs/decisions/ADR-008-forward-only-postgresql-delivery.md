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
- Run migrations once in the Netlify production context before build. Preview
  contexts build without production database credentials.
- Run a one-shot migration container before a self-hosted app replacement.
- Deliver future changes through expand/backfill/contract releases and recover
  by forward fix rather than destructive down migrations.

## Consequences

Production schema changes are reviewable and portable, and previews remain
isolated from production data. Operators must keep a direct credential separate
from the runtime pool and ensure only one production migration runner operates.
An old application deploy may be restored only while additive schema
compatibility remains; otherwise a new forward fix is required.

## References

- `db/migrations/`
- `drizzle.config.ts`
- `netlify.toml`
- `Dockerfile`
- `docs/OPERATIONS.md`
