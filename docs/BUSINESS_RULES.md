# ScopeDelta Business Rules

## Scope analysis

- Every AI scope conclusion must be reviewable by an authorized agency user before it becomes client-facing.
- Prefer traceability: conclusions should reference the relevant agreed scope item(s) or explicitly say when no supporting scope item was found.
- Supported classifications for the initial product are: `in_scope`, `out_of_scope`, `partially_in_scope`, and `insufficient_information`.
- Uncertainty should be surfaced rather than hidden. When evidence is insufficient, ask for clarification instead of fabricating certainty.
- Model claims must cite server-issued evidence keys from the persisted context snapshot.
- Scope analysis requires an owner, admin, or project lead. Work/QA context may
  be run by any authorized internal project member. Client participants cannot
  access AI jobs or results.
- AI-created work is always backlog, unclassified, unassigned, and commercially
  unlinked until a human deliberately changes it.
- AI-created clarification questions are internal drafts and never enter client
  discussion automatically.
- Confirmation must fail when the originating request/evidence context is stale,
  deleted, unavailable, or belongs to another project.

## Commercial information

- Internal engineering cost, margin, internal notes, and internal estimates must never appear on client-facing pages unless explicitly designed as client-visible fields.
- Client-facing quoted price and timeline are controlled by the agency user.
- AI may suggest impact but must not automatically send or commit a commercial quote.

## Approvals

- A client approval record must be attributable to a specific change order/version.
- Material edits to a previously approved change order must not silently retain the old approval state.
- The system should preserve enough history to reconstruct what the client approved.

## Tenant isolation

- Data belonging to one organization/workspace must not be readable or mutable by another organization/workspace.
- Public approval links must expose only the minimum data needed for the intended client workflow.

## Customer data

- Do not use confidential customer contracts or client content as public fixtures, examples, or logs.
- Synthetic/anonymized examples are preferred for development and tests.
- Production AI providers must have acceptable data handling terms before real confidential customer documents are processed.
- A deployment selects one AI provider/model/base-URL route. ScopeDelta must
  fail closed on route drift and must not route or fall back automatically.
- AI snapshots, results, and clarification drafts are customer content stored in
  PostgreSQL, not operational log metadata or client-safe projection fields.

## MVP operating constraints

- Optimize for a fast paid-pilot launch.
- Avoid introducing paid infrastructure without a clear reason and founder approval when material.
- Avoid broad integrations until a pilot/customer demonstrates that the integration is necessary for conversion, activation, or retention.

## Distribution and subscription economics

- Self-host is the default distribution mode. Core Local/LAN and BYO/local AI
  capabilities must not depend on ScopeDelta Cloud availability or a cloud
  subscription check.
- Managed-cloud entitlements are stored as an effective workspace snapshot.
  Public plan names, prices, and final allowances remain configuration and
  founder decisions rather than source-code constants.
- Active-project and optional internal-user limits apply to transitions that
  consume capacity. Lowering a limit must preserve history and existing records;
  the next capacity-consuming transition fails instead.
- External client participants do not consume internal-user capacity.
- ScopeDelta-managed AI and email attempts consume the configured allowance.
  BYO/local AI and self-hosted SMTP do not consume ScopeDelta-managed usage.
- Browser checkout return pages are informational. Only authenticated provider
  events may activate, change, or expire a subscription.
- Payment failure, grace, cancellation, and expiry may block new managed or
  capacity-consuming actions, but must not delete history or block normal reads.
