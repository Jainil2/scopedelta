# ADR-016 — GA data-lifecycle, retention, and deletion boundary

Status: Accepted
Date: 2026-08-25
Issue: SC-012 / #15

## Context

SC-011C introduced non-destructive workspace closure/deletion intent but intentionally did not establish retention authority or physically delete customer data. Older Layer-8 planning text in `docs/PRODUCT.md`, `docs/ROADMAP.md`, and ADR-015 loosely assigned physical deletion/data deletion to Layer 8 before the focused SC-012 research checkpoint was completed.

The SC-012 checkpoint separates technical GA hardening from legal/customer-policy commitments. ScopeDelta can and should prove backup/restore, export, closure processing, data inventory, authorization, auditability, and fail-closed lifecycle behavior without inventing final retention periods or enabling irreversible purge before an approved policy exists.

## Decision

1. SC-012 implements and verifies **non-destructive lifecycle processing**, not irreversible physical purge.
2. Workspace lifecycle requests remain explicit administrative intent. Processing must be inspectable and auditable and must not silently disable or erase authoritative delivery/commercial/client/audit history.
3. SC-012 must produce a durable inventory of data requiring future deletion/retention treatment across database records, commercial source bytes, provider references, billing references, AI evidence, client acceptance/audit evidence, and backups.
4. Tenant-authorized open-format export, complete-schema backup/restore verification, and closure/recovery operations are GA requirements.
5. Physical purge timing, legal retention periods, Terms/Privacy/DPA wording, customer-facing deletion promises, and irreversible automated deletion remain founder/legal gates.
6. Until an approved retention/deletion policy exists, irreversible purge must **fail closed**.
7. SSO/SAML, SCIM, arbitrary/custom RBAC, multi-region managed-cloud residency, and certification work are also not prerequisites for SC-012; Layer 8 is GA risk closure rather than enterprise checkbox parity.
8. This ADR supersedes only the older statements that assign **physical deletion or a final deletion/retention policy** to Layer 8 in `docs/PRODUCT.md`, `docs/ROADMAP.md`, and ADR-015. Their non-destructive lifecycle-intent, export, recovery, backup, observability, security, and other Layer-8 direction remains valid.

## Consequences

- Codex can complete SC-012 without inventing legal policy or implementing destructive behavior.
- ScopeDelta still reaches a credible GA boundary by proving restore/export/closure operations and documenting all retained data classes.
- A later founder/legal decision can authorize a retention/deletion policy and a separately reviewed purge implementation without rewriting historical evidence or implying that current closure requests physically erase data.
- Durable planning artifacts must interpret any older “deletion” wording through this ADR and SC-012 / #15 until those summaries are next edited.

## References

- SC-012 / #15
- SC-011C / #48
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- `docs/OPERATIONS.md`
- `docs/SELF_HOST.md`
- `docs/decisions/ADR-015-self-service-activation-lifecycle-signal-boundary.md`
