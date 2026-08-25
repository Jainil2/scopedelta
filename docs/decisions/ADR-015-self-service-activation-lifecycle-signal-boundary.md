# ADR-015 — Self-service activation, recovery, and lifecycle boundary

Status: Accepted
Date: 2026-08-25
Issue: SC-011C / #48

## Context

ScopeDelta needs a self-service path for setting up a useful workspace, administering access, recovering from routine provider failures, and understanding deployment-local activation without creating a second source of truth or collecting customer content. Workspace membership is durable evidence today, so destructive removal would break historical authorship and acceptance chains. The repository also has no global operator identity or physical-deletion/retention authority.

## Decision

1. Onboarding is permission-aware and state-driven. Core completion is derived from authoritative workspace, client, project, commercial, collaboration, engineering, QA, AI, migration, and billing records. Per-admin storage contains only dismissal/resume preference; signal rows never determine completion.
2. Membership removal becomes suspension. Suspension immediately removes workspace and project access while preserving assignments, authorship, audit, delivery, and acceptance evidence. Reactivation rechecks managed capacity and never restores project grants implicitly. The sole active owner and active-project leads must be reassigned first.
3. Invitation delivery evidence contains bounded state, attempt count, safe error code, and timestamp. Creation and reissue rotate the token and return the acceptance URL once to the authorized admin so Local/LAN operation does not require SMTP. Tokens, recipients, and message bodies are excluded from logs and signals.
4. Closure/deletion requests are administrative intent only. An owner must confirm the exact slug, acknowledge export and retained-history boundaries, and resolve any active managed subscription. Requests can be canceled and do not disable the workspace, delete data, or establish retention.
5. Recovery guidance uses stable safe failure classes and states whether authoritative data is unchanged, partially committed, or preserved. Provider messages and payloads are not rendered as user guidance. A successful retry clears the current blocker while historical audit/signal evidence remains bounded.
6. Product signals are deployment-local, allowlisted aggregates containing only workspace/subject identifiers, enums, safe dimensions, counts, and first/last timestamps. Repeats increment one row. Pageviews, customer documents, prompts/results, comments, source code, email content, recipients, and provider payloads are forbidden.
7. The operator surface is a bounded content-free CLI export using a fixed aggregate-query set. Self-host collection/export makes no network calls. A global operator web identity, outbound telemetry/alerts, and physical deletion remain Layer 8 work.
8. Onboarding, member administration, lifecycle intent, recovery guidance, and local signal storage/export are Local/LAN capabilities. Managed billing and external-provider actions retain their existing runtime classifications.

## Consequences

- A workspace can recover access and delivery without corrupting historical evidence.
- Activation reporting remains useful but cannot fabricate product state or expose customer content.
- Administrators receive a clear export-first request path without implying that data was physically erased.
- Operational monitoring is intentionally bounded and deployment-local until an explicit operator-auth, telemetry-transport, retention, and deletion design is approved.

## References

- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/OPERATIONS.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- `docs/decisions/ADR-014-template-migration-portability-boundary.md`
