# ADR-007 — Portable Identity and Persistence Kernel

## Status

Accepted for SC-004 — 2026-08-07.

## Context

ADR-004 requires self-service multi-tenant operation, ADR-005 requires one core
that supports managed cloud and credible self-hosting, and ADR-006 establishes
server-authoritative cloud, LAN, and self-host operation for future web and
desktop clients. The application needs durable identity, revocable sessions,
tenant membership, authorization, invitations, and audit history before
commercial-delivery entities can be built. It must not require a paid or
proprietary identity platform.

## Decision

Use Better Auth inside the existing Next.js application with PostgreSQL-backed
credentials, verification records, sessions, and rate limits. Use PostgreSQL as
the platform system of record through Drizzle and checked-in SQL migrations.
Use provider-neutral SMTP through Nodemailer. Keep runtime, migrations, and mail
at PostgreSQL/SMTP protocol boundaries so Netlify and the production container
run the same application.

Tenant authorization and mutations live in shared server domain services. A
provider-neutral `EntitlementPolicy` is invoked there; the first community
policy allows all Layer-0 operations and has no billing semantics. Audit events
are immutable, versioned, tenant-scoped, and restricted to allowlisted metadata.

## Security decisions

- Verified email is required before normal account use.
- Sessions live seven days with sliding renewal; protected reads validate the
  database and password reset revokes existing sessions.
- Verification/reset tokens expire after one hour; invitation tokens after
  seven days.
- Invitation secrets are hashed at rest and transported in URL fragments before
  exchange for a short-lived `HttpOnly` cookie.
- Tenant misses and cross-tenant access are indistinguishable 404 responses.
- Names, emails, tokens, secrets, and customer content are excluded from audit
  metadata and operational logs.

## Consequences

The system gains production persistence and self-service identity without a
hosted identity dependency. PostgreSQL and SMTP become required platform
operations. Database session validation adds latency but makes revocation and
membership changes authoritative. Later billing/SSO policies can be introduced
behind existing service boundaries, but SC-004 implements neither.

## References

- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/decisions/ADR-004-self-serve-production-saas.md`
- `docs/decisions/ADR-005-ai-native-client-delivery-os.md`
- `docs/decisions/ADR-006-self-host-source-visible-desktop-policy.md`
