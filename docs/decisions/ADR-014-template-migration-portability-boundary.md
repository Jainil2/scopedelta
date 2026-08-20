# ADR-014 — Template, Migration, and Core Portability Boundary

## Status

Accepted — SC-011B review candidate, 2026-08-20.

## Context

Established software-delivery organizations need a practical path from Jira or a generic CSV export into ScopeDelta, reusable project standards, and a credible exit path. Recreating Jira's arbitrary workflows/custom fields would undermine ScopeDelta's opinionated delivery model, while a direct mutation-first importer would create unacceptable tenant, retry, and data-loss risk.

## Decision

### Templates are copied snapshots

Workspace owners/admins manage versioned project templates containing bounded project context, milestone, cycle, work-item, subtask, acceptance-criteria, estimate, purpose, and label skeletons. Applying a template creates a new project and copies the selected definition atomically. The applied template version and definition snapshot are retained. Later edits increment the template version and never rewrite an existing project or application snapshot.

Templates do not define custom workflows, schemas, permissions, screens, or arbitrary field behavior. ScopeDelta's fixed delivery workflow remains authoritative.

### Preview state is durable but not delivery truth

An import begins as a tenant-scoped durable session containing:

- source kind and explicit source namespace;
- bounded filename/file fingerprint and mapping options;
- normalized row evidence, warnings, blocking errors, and unsupported values;
- unresolved source identities;
- created/skipped/failed result references after confirmation.

Preview creates no client, project, membership, milestone, cycle, work item, or other authoritative delivery state. Confirmation is a separate owner/admin action.

### Source identity controls idempotency

Authoritative migration provenance uses:

`workspace + source kind + source namespace + object kind + source project key + source object key`

Titles are never authoritative deduplication keys. The source project key keeps identical Jira issue keys in different source projects distinct. A repeated source object is skipped and reported; a changed fingerprint is never used to overwrite the existing delivery object silently.

### Imported people remain unresolved until explicitly mapped

Assignee/reporter text creates a bounded source-identity record, not a user or workspace membership. An owner/admin may explicitly map that identity to an existing workspace member during confirmation. Only then may the importer add that existing member to the imported project and assign compatible work. Import never creates a privileged workspace membership or sends an invitation.

### Hierarchy is preserved only when meaning is safe

Parents may appear after children in a CSV because preview resolves the complete bounded source set before confirmation. One top-level work item plus one subtask level maps to ScopeDelta. Missing parents, duplicate keys, self/circular references, and deeper hierarchy are explicit blocking row evidence; they are not silently flattened.

### Confirmation is bounded and recoverable

Confirmation claims a renewable five-minute session lease, creates/reuses destination projects by source provenance, then commits work in batches of 100. Completed batches remain committed if a later batch fails. Row outcomes and `committed_anything` remain inspectable; a failed or partially completed session can retry failed rows while already-created source objects are skipped idempotently. Advisory transaction locks and database uniqueness serialize concurrent sessions for the same source identity.

### CSV is inert content with explicit limits

CSV parsing is local and bounded to 5 MB, 5,000 data rows, 64 columns, and 10,000 characters per field. It supports quoted delimiters/newlines and rejects malformed quoted input. Imported markup/scripts are stored only as escaped text and are never executed. Formula-like input is reported and remains inert. No attachment URL is fetched.

Audit metadata records structured codes/counts only; it does not copy row bodies or customer descriptions into ordinary logs.

### Export is a defined core-delivery artifact

Owner/admin export produces a formula-neutralized UTF-8 CSV for up to 25 projects and 5,000 records per batch (or one selected project). It includes client/project identity, milestones, cycles, work/subtasks, statuses, priorities, assignments, estimates/dates, acceptance criteria, labels, and migration references.

The response and every row identify the scope as `core_delivery_not_legal_audit`. This is not represented as a complete legal, commercial, engineering, QA, retention, or audit archive. Those broader lifecycle/export guarantees remain Layer 8.

## Jira boundary

SC-011B provides a Jira CSV preset with explicit standard-header and value mapping. Unsupported/custom populated columns are reported and bounded values are preserved as migration metadata. Jira workflows, schemes, screens, arbitrary custom-field behavior, dashboards, automation, attachments, OAuth, and API sync are not recreated.

## Authorization

- Owners/admins manage templates, apply templates, preview/confirm imports, inspect row evidence, map identities, and export core delivery data.
- Internal members receive forbidden responses for these administrative actions.
- External participants and cross-workspace actors remain behind the existing safe not-found boundary.

## Runtime and consequences

Templates, generic CSV import/export, and the Jira CSV preset are Local/LAN. They require PostgreSQL and local application compute only; no ScopeDelta Cloud, Jira API, AI model, remote parser, or paid provider is required.

Consequences:

- normalized preview rows intentionally retain bounded customer migration content inside the tenant database;
- direct Jira API/OAuth migration remains deferred until customer testing shows CSV is insufficient;
- template applications favor traceable copies over live inheritance;
- complete compliance/archive export remains Layer 8.

## References

- SC-011B / #47
- SC-011 / #14
- `docs/ADOPTION_MIGRATION.md`
- `docs/PRODUCT.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- ADR-005
