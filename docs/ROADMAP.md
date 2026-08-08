# ScopeDelta Layered Production Roadmap

This roadmap builds ScopeDelta as an AI-native client software delivery operating system for 50–500-person software service organizations.

The product is built layer by layer. Each layer must be useful, secure and production-quality before downstream layers rely on it. We are not attempting to clone every Jira/Linear/Plane/PSA feature before shipping differentiation.

The runtime model is **one server-authoritative product core with multiple clients/deployments**: ScopeDelta Cloud, customer self-hosted/VPC, company LAN/private server, web client and a later first-party desktop client. Core Local/LAN capabilities must not require ScopeDelta Cloud.

## Completed foundation

Complete:

- deployable Next.js application foundation;
- CI, lint/typecheck/test/build gates;
- public landing page and production Netlify deployment;
- Layer 0 production platform kernel: authentication/recovery, workspaces/memberships, PostgreSQL persistence/migrations, authorization, audit/events, shared service/API boundary, self-host/LAN-compatible operation and deployment/backup documentation;
- Layer 1 client-project delivery core through SC-005A/B/C, ending with PR #29.

SC-004 / #8 and SC-005 / #9 are complete.

## Layer 1 — Delivery Core — COMPLETE

### Outcome
A software-delivery team can manage normal client project work in ScopeDelta without needing Jira/Linear for basic issue/project tracking.

Canonical spine:

`Workspace → Client → Project → Milestone → Work item`

Optional planning overlay:

`Project → Cycle → Work item`

Default workflow:

`Backlog → Ready → In Progress → In Review → Done`

`Canceled` is a terminal non-completed outcome.

Delivered through:

1. SC-005A / #23 — client-project backlog foundation — PR #26.
2. SC-005B / #24 — planning and daily execution — PR #27.
3. SC-005C / #25 — collaboration and project context — PR #29.

Layer-1 research: `docs/research/LAYER1_DELIVERY_CORE_RESEARCH_2026-08.md`.

## Cross-cutting track — Desktop Client

### Outcome
Give daily users a first-party Windows/macOS/Linux client without creating a second product backend or requiring ScopeDelta Cloud.

### Timing
DX-001 is technically unblocked by completion of Layer 1, but it is **not prioritized ahead of Layer 2**. The Commercial Delivery Graph is the differentiated revenue/activation wedge and remains the next P0 product layer. Desktop work should not delay SC-006A without new customer evidence.

### Boundary
- reuse the same server/domain/API rules;
- support ScopeDelta Cloud and customer-controlled HTTPS/LAN servers;
- native notifications/deep links and bounded secure local cache;
- no authoritative per-user project database;
- no full offline peer-to-peer/CRDT collaboration initially.

## Layer 2 — Commercial Delivery Graph

### Outcome
ScopeDelta becomes meaningfully different from generic PM or PSA systems: **commercial provenance becomes a first-class property of delivery work**.

A PM should be able to answer:

- What did we agree to?
- What has changed since then?
- Which client requests are unresolved?
- Why does this material delivery item exist commercially?
- Which client-delivery work is commercially unlinked?
- Which work was covered, deliberately absorbed, swapped, accepted as a paid change, deferred or rejected?

### Research checkpoint — COMPLETE 2026-08-09

Current product/market research found:

- PSA products are strong at quotes/budgets/rates/timesheets/change-order financial control; Scoro already links quoted services to tasks, so `sold line → task` is not enough differentiation.
- Jira/Linear can capture customer requests and link them to delivery work, but their reviewed workflows do not make commercial authorization semantics the opinionated system of record.
- Requirements traceability/baselines are mature in ALM products; the graph data structure itself is not the wedge.
- AI SOW comparison/change-order tools already exist, so `upload SOW → AI in/out verdict → change order` is not defensible by itself.
- Real software-service change control is not binary. Requests may be covered by current obligations, absorbed, swapped, paid, deferred or rejected, and clarification is workflow state rather than a commercial outcome.

Durable research: `docs/research/LAYER2_COMMERCIAL_DELIVERY_GRAPH_RESEARCH_2026-08.md`.

### Final Layer-2 model

Logical graph:

`Project → Commercial baseline → Baseline version → Commercial scope item`

Evidence:

`Scope item / Request / Decision → Evidence anchor → Commercial evidence source`

Change control:

`Client request → Effective commercial decision → Commercial basis relationship → Work item`

Amendments:

`Baseline version N → version N+1 + scope-item lineage`, preserving historical work/decision relationships.

Minimum commercial scope-item kinds:

- `deliverable`;
- `requirement`;
- `exclusion`;
- `constraint`.

Minimum request lifecycle:

- `open`;
- `needs_clarification`;
- `resolved`;
- `withdrawn`.

Minimum confirmed commercial dispositions:

- `covered`;
- `absorbed`;
- `swap`;
- `paid_change`;
- `deferred`;
- `rejected`.

`covered` may retain a coverage basis such as baseline, defect/warranty, revision allowance or other existing obligation. `needs_clarification` is not a commercial disposition. Direct work-to-baseline scope links do not require redundant `covered` decisions.

Minimum work-purpose classification:

- `unclassified`;
- `client_delivery`;
- `delivery_support`;
- `internal`.

Only `client_delivery` work without an effective commercial basis is the high-severity **commercially unlinked** state. `unclassified` is a lower-severity hygiene warning. `delivery_support` and `internal` avoid false-positive scope-creep alerts.

### Document ingestion boundary

Required first-production inputs:

- pasted plain text;
- text-based PDF;
- DOCX.

Layer 2 performs deterministic validation, private storage, text extraction and evidence anchoring. Humans curate scope items. Scanned/image OCR, semantic AI extraction, automatic request decomposition and AI scope verdicts are excluded from Layer 2 and belong to later evidence-backed work, primarily SC-009 for intelligence.

### SC-006A / #30 — Commercial baseline, work provenance and advisory drift

Outcome: an existing ScopeDelta project can import its real commercial source, curate an evidence-backed initial baseline, classify delivery work, link client-delivery work to agreed scope, and immediately see commercially unlinked/unclassified work.

Scope:

- paste + text-PDF + DOCX evidence sources;
- deterministic extraction and evidence anchors;
- immutable initial baseline/version foundation;
- commercial scope items;
- work-purpose classification;
- work-to-baseline commercial basis links;
- advisory drift view/work-item provenance;
- authorization/audit/privacy/self-host reliability.

Runtime: **Local/LAN**, no mandatory AI/OCR/document SaaS/paid provider.

### SC-006B / #31 — Client request and commercial decision ledger

Outcome: PM/commercial users can capture real client asks and make explicit non-binary commercial decisions that authorize—or intentionally do not authorize—resulting work.

Scope:

- atomic client request records;
- request clarification/resolution lifecycle;
- `covered / absorbed / swap / paid_change / deferred / rejected` decisions;
- coverage basis for baseline/defect/revision/other obligation;
- effort/schedule/money impact with estimates separated from confirmed values;
- decision-to-work commercial basis links;
- unresolved-request/decision/conflict UX;
- swap integrity and superseded-decision history.

Runtime: **Local/LAN**, no mandatory AI/external provider.

### SC-006C / #32 — Baseline amendments, lineage and drift reconstruction

Outcome: commercial scope can evolve through amendments without rewriting history, and active/historical work remains explainable against the commercial state that authorized it.

Scope:

- additional effective baseline/amendment versions;
- scope-item lineage across versions;
- amendment evidence continuity;
- decision ↔ amendment relationships;
- stale/superseded-basis warnings for active work;
- project commercial reconstruction/history;
- Layer-2 scale, parser recovery, accessibility and self-host hardening.

Runtime: **Local/LAN**.

### Explicit Layer-2 non-goals

- invoice/accounting/timesheet/rate-card/PSA engine;
- CRM sales pipeline;
- generic CLM/legal redlining/e-signature system;
- automatic email/Slack/CRM/Drive capture;
- scanned-image OCR in the initial Layer-2 sequence;
- AI semantic extraction/classification/change-order drafting — SC-009;
- client portal/native approval — SC-007;
- Git/CI/QA evidence — SC-008;
- generic requirements-management/custom relation platform;
- separate graph database without demonstrated need;
- hard commercial gate by default.

### Layer-2 exit criteria

SC-006A/B/C are complete and production-quality. A PM can reconstruct the effective baseline and amendments, capture/resolve requests using the non-binary commercial taxonomy, link material client-delivery work to baseline or confirmed decision provenance, distinguish legitimate support/internal work, and identify unlinked/unclassified/stale commercial relationships without AI or mandatory ScopeDelta Cloud dependency.

## Layer 3 — Client Collaboration & Negotiation

### Outcome
Client interaction becomes part of the same graph without exposing the internal engineering workspace.

### Scope
- secure project-specific client participants/portal;
- client request/clarification intake;
- client-safe status/milestones;
- commercial decision/change proposal packets;
- approve/reject/request-clarification;
- deliverable/milestone acceptance;
- immutable shared versions and audit history;
- notifications/recovery;
- client-safe vocabulary/content separate from internal technical detail.

### Exit criteria
A client can request, understand, review and approve relevant delivery/commercial changes without receiving an internal employee seat or seeing unrelated internal data.

## Layer 4 — Engineering & QA Delivery Loop

### Outcome
Planning, implementation, QA and acceptance form one traceable delivery chain.

### Scope
- GitHub integration first, GitLab when justified;
- work ↔ branch/commit/PR/CI evidence;
- bugs/defects and lightweight QA verification;
- requirement/acceptance-criteria coverage;
- release readiness;
- trace requested → commercially authorized → planned → implemented → tested → accepted.

### Boundary
Do not build Git hosting or a CI/CD runner platform.

## Layer 5 — AI-Native Delivery Intelligence

### Outcome
AI reduces coordination work across PM, developer, QA, commercial and client roles instead of acting as an isolated chatbot.

### Scope
- semantic scope/request comparison with evidence;
- structured requirement/work generation;
- PM hygiene/risk/replanning assistance;
- developer context and ambiguity detection;
- QA test/risk/coverage assistance;
- client-safe summaries;
- bounded agent actions with permission/audit rules;
- managed AI plus BYO/local paths where practical;
- evaluation, retry/idempotency and cost controls.

Layer 2 intentionally creates the deterministic graph and evidence substrate before this intelligence layer.

## Layer 6 — Subscription, Cloud Economics & Source Distribution

### Outcome
ScopeDelta can grow without founder-funded variable costs while supporting useful free self-hosting and a protected managed-cloud business.

### Scope
- self-host packaging/upgrade path;
- managed cloud onboarding;
- recurring billing/entitlements;
- managed AI/storage/email/processing allowances;
- usage enforcement and operational cost controls;
- source/package boundaries aligned with LIC-001.

### Founder/legal gates
Exact source-available/open-source/proprietary package boundary/license, public prices/allowances, live billing-provider commitments and legal/customer terms require explicit founder approval before public activation.

## Layer 7 — Portfolio, Operations & Self-Service Scale

### Outcome
Larger 50–500-person organizations can operate many concurrent projects with low administrative burden.

### Scope
- portfolio/project health;
- capacity/workload;
- trustworthy budget/margin visibility where supported by data;
- templates/standards;
- migration/import/export;
- onboarding/help/admin/data lifecycle;
- privacy-safe activation/reliability signals.

## Layer 8 — Enterprise & General-Availability Hardening

### Outcome
The complete system is safe and reliable for paying production customers at increasing scale.

### Scope
- tenant/client authorization audit;
- data lifecycle/retention/export/deletion;
- backup/recovery and provider-failure behavior;
- webhook/event idempotency;
- observability/alerts/privacy-safe telemetry;
- cost/abuse controls;
- representative 50–500-person performance/load checks;
- end-to-end revenue-critical tests;
- SSO/SCIM/advanced governance only when justified by real launch/customer requirements.

## Runtime classification rule

Every capability must be classified before implementation as one of:

1. **Local/LAN** — fully runnable on customer-controlled ScopeDelta infrastructure without ScopeDelta Cloud.
2. **Hybrid/optional external** — local core with optional customer-selected local/external provider.
3. **External API/service** — capability inherently depends on an outside system.
4. **Managed-cloud only** — ScopeDelta-operated convenience/operations rather than unique product logic.
5. **Desktop client** — client-side feature using the shared server/domain rules.

`docs/FEATURE_RUNTIME_MATRIX.md` is the durable inventory and RS-002 maintains it.

## Competitive product rule

Before implementing a major feature, classify it as:

1. **Table stakes** — necessary to replace the incumbent for daily use.
2. **Differentiator** — advances commercial/delivery traceability, client-delivery workflow or AI-native coordination advantage.
3. **Later enterprise capability** — useful at scale but not needed now.
4. **Do not build** — mature external infrastructure we should integrate instead.

Table-stakes features should be implemented simply. Differentiators deserve disproportionate product/research effort.

## Engineering sequencing

GitHub issues are the executable source of truth. **Exactly one highest-priority unblocked engineering issue should be `READY FOR CODEX` at a time.**

Current intended sequence:

1. SC-004 / #8 — Layer 0 Platform Kernel — **DONE**.
2. SC-005A/B/C — Layer 1 Delivery Core — **DONE**.
3. SC-006A / #30 — baseline, work provenance and advisory drift — **next executable Layer-2 slice after readiness control update**.
4. SC-006B / #31 — request and commercial decision ledger — blocked by #30.
5. SC-006C / #32 — amendments, lineage and reconstruction — blocked by #31.
6. SC-007 / #11 — Layer 3 client collaboration/negotiation.
7. SC-008 / #12 — Layer 4 engineering/QA evidence.
8. SC-009 / #17 — Layer 5 AI-native delivery intelligence.
9. SC-010 / #13 — Layer 6 subscription/cloud economics/source distribution.
10. SC-011 / #14 — Layer 7 portfolio/operations/self-service scale.
11. SC-012 / #15 — Layer 8 enterprise/GA hardening.

Cross-cutting:

- #28 quality/Sonar/secret-scanning follow-up remains **P1 and separate/non-blocking** unless it exposes a new unwaived security/reliability regression.
- DX-001 desktop remains a later cross-cutting client track and does not preempt the Commercial Delivery Graph without new evidence.
- ARCH-001 maintains runtime topology.
- RS-002 maintains feature/runtime/cost classification.
- LIC-001 is the founder/legal gate before public core-source release.

The layers are product boundaries, not permission for giant PRs. SC-005 and SC-006 establish the precedent: research should deliberately produce smaller production-usable vertical slices when that reduces risk and accelerates differentiated customer value.
