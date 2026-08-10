# ADR-009 — Dedicated Client Projection Boundary

## Status

Accepted for SC-007 — 2026-08-10.

## Context

Clients need request, negotiation, discussion, and delivery-acceptance workflows
without gaining internal workspace or project access. Reusing internal project
DTOs or adding ad hoc visibility flags would make backlog, estimates, notes,
rationale, evidence, and future internal fields vulnerable to accidental
disclosure. Commercial and acceptance actions also need exact-version evidence
that remains distinct from internal authorization.

## Decision

- Keep external participants project-scoped and separately authorized from all
  workspace and internal project memberships.
- Build client reads through one allowlisted `ClientProjectProjection` shared by
  the external surface and internal preview.
- Use expiring, single-use, hashed invitation tokens that bind to a verified
  matching Better Auth account; preserve revoked participants for attribution.
- Store external-safe messages separately from internal comments and notes.
- Publish immutable/versioned commercial packets and acceptance targets by
  copying explicit safe snapshots from authoritative internal state.
- Permit only active approvers to take terminal actions. Lock exact versions,
  enforce one winner with database constraints, make same-key retries stable,
  and reject stale or incompatible actions without changing internal state.
- Keep in-app notifications authoritative. SMTP is optional, post-commit, and
  stores only delivery status; generated invitation URLs remain copyable.
- Apply private/no-store, no-index/no-follow/no-archive, no-referrer,
  same-origin mutation, verified-session, bounded-input, rate-limit, and
  content-free logging rules across client pages and APIs.

## Consequences

External access cannot expand internal project authority, and internal model
growth does not automatically expand the client contract. Published history and
client action evidence remain reconstructable even after supersession or
revocation. The tradeoff is purpose-built schema, routes, services, DTOs, and UI
instead of reusing internal views. Operators may run the complete workflow with
PostgreSQL alone; missing or failed SMTP never rolls back business state.

## References

- `db/migrations/0010_client_collaboration.sql`
- `src/lib/client-project-projection.ts`
- `src/server/client-collaboration.ts`
- `docs/research/LAYER3_CLIENT_COLLABORATION_RESEARCH_2026-08.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
