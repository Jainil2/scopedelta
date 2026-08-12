# ADR-010: Engineering evidence is a normalized internal projection

## Status

Accepted for SC-008 on 2026-08-12.

## Context

ScopeDelta must connect commercially authorized work to implementation, QA,
defects and client acceptance without becoming a source-control host, CI runner,
code-review tool or test-management suite. Provider evidence can be duplicated,
reordered, missed, changed after a force-push or unavailable after access is
revoked. It must never cross tenant, project or client-projection boundaries.

## Decision

- Use a least-privilege read-only GitHub App and explicit repository grants.
  Never persist installation tokens.
- Normalize bounded pull-request/head/review/check/merge metadata behind a
  provider-neutral adapter. Do not store source, diffs, review text, CI logs or
  webhook payloads.
- Keep one mutable current projection and database-enforced immutable snapshots
  of meaningful state changes.
- Treat signed, deduplicated webhooks as hints and bounded reconciliation as the
  repair path. Ignore events older than current provider state; allow an
  equal-timestamp check rerun to refresh rollups.
- Scope manual and project-key work links with composite project foreign keys.
  Preserve removed automatic links as tombstones.
- Keep QA verification append-only with captured work/head fingerprints. Model
  defects separately from client acceptance.
- Compute factual evidence gaps and trace views locally without an opaque score.
- Keep all engineering and QA evidence internal-only. Any future client fact
  requires a separately designed explicit allowlist.

## Consequences

Local/LAN deployments retain QA, defect, trace and readiness value without a
provider. GitHub evidence requires GitHub and becomes visibly stale during an
outage or after disconnect while history remains reconstructable. GitLab can be
added later through the adapter, but SC-008 does not implement it. ScopeDelta
remains intentionally thinner than GitHub, CI and dedicated test-management.
