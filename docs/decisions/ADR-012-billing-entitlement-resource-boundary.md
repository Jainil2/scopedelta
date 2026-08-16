# ADR-012 — Subscription, entitlement, and managed-resource boundary

Status: Accepted
Date: 2026-08-16
Issue: SC-010 / #13

## Context

ScopeDelta must support useful free internal self-hosting and a managed cloud
without allowing managed AI, email, database, or compute spend to grow without
hard limits. Billing-provider state is asynchronous and untrusted until a
signed webhook is processed. Commercial state must not delete customer history
or leak payment/provider details into the browser, logs, or domain services.

## Decision

1. Distribution mode is explicit. `self_host` is the default and never calls a
   ScopeDelta Cloud entitlement service for Local/LAN capability.
2. A centralized provider-neutral plan catalog defines software capabilities,
   active-project capacity, optional internal-user capacity, and managed AI,
   email, storage, and processing allowances. Public names/prices/allowances are
   configuration, not domain constants.
3. External client participants are separate from internal memberships and do
   not consume internal-user capacity.
4. Workspace billing stores one effective provider-neutral subscription and
   entitlement snapshot. Provider events provide immutable processing evidence;
   full payloads and card data are not stored.
5. Paddle sandbox is the first adapter. Hosted checkout and portal are used.
   The browser return never activates access; signed raw-body webhook state is
   authoritative.
6. Project activation and internal-member admission serialize on the workspace
   row. Managed AI/email allowance uses an idempotent usage ledger. AI reserves
   before provider work and settles after call start.
7. Payment failure, grace, cancellation, and expiry are non-destructive.
   Existing history remains readable; new capacity/provider-consuming actions
   may be denied by policy.
8. Raw provider/model/token/duration data remains economic evidence. Vendor
   token price tables are not authoritative entitlement state.

## Consequences

- Cloud and self-host share the same product/domain core without artificial
  cloud-only feature checks for local-capable workflows.
- Checkout initiation may fail closed in an ambiguous `creating` state after a
  process interruption. An outbound provider error creates a short
  reconciliation cooldown before a new attempt, reducing duplicate risk while
  allowing recovery.
- Lowering project capacity below current usage does not delete or deactivate
  projects; the next create/reactivation is denied until capacity is available.
- A failed provider call after invocation consumes managed allowance because
  spend may already have occurred. Validation/configuration failure before
  invocation does not.
- Exact live billing and source distribution remain founder/legal gates.

## References

- `docs/research/LAYER6_CLOUD_ECONOMICS_DISTRIBUTION_RESEARCH_2026-08.md`
- `docs/decisions/ADR-006-self-host-source-visible-desktop-policy.md`
- `docs/decisions/ADR-011-ai-provider-data-and-action-boundary.md`
- LIC-001 / #19
