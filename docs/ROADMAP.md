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
- Layer 1 client-project delivery core;
- Layer 2 Commercial Delivery Graph.

SC-004 / #8, SC-005 / #9 and SC-006 / #10 are complete.

## Delivery-speed rule

Default to **one business task/product outcome = one engineering issue and one primary implementation PR**.

Do not automatically create A/B/C issues merely because an implementation has phases. Keep phases inside the issue/PR unless a split has a concrete benefit.

Split only when at least one of these is true:

- the combined change is too large to review/reason about safely;
- a real dependency blocks part of the work;
- separate migration/deployment/rollback boundaries materially reduce production risk;
- an authorization/security boundary should be independently reviewed;
- a useful customer outcome can ship materially earlier;
- parallel execution would reduce elapsed time more than the integration/CI/review overhead it creates.

Testing follows the same efficiency principle: focused tests during iteration, focused E2E while building a journey, and the complete migration/lint/typecheck/unit/integration/E2E/build/container gate when the PR is genuinely ready plus final pre-merge validation after completed review fixes. Quality is not reduced; redundant full-suite cycles are.

`AGENTS.md` is the executable engineering policy for this rule.

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

Delivered through SC-005A/B/C and completed with PR #29.

Layer-1 research: `docs/research/LAYER1_DELIVERY_CORE_RESEARCH_2026-08.md`.

## Cross-cutting track — Desktop Client

### Outcome
Give daily users a first-party Windows/macOS/Linux client without creating a second backend or requiring ScopeDelta Cloud.

### Timing
DX-001 is technically unblocked by Layer 1, but differentiated product layers remain higher priority unless customer evidence changes the order.

### Boundary
- reuse the same server/domain/API rules;
- support ScopeDelta Cloud and customer-controlled HTTPS/LAN servers;
- native notifications/deep links and bounded secure local cache;
- no authoritative per-user project database;
- no full offline peer-to-peer/CRDT collaboration initially.

## Layer 2 — Commercial Delivery Graph — COMPLETE

### Outcome
ScopeDelta becomes meaningfully different from generic PM or PSA systems: **commercial provenance becomes a first-class property of delivery work**.

A PM can answer:

- What did we agree to?
- What changed?
- Which client requests remain unresolved?
- Why does this material delivery item exist commercially?
- Which client-delivery work is commercially unlinked or stale?
- Which work was covered, deliberately absorbed, swapped, accepted as a paid change, deferred or rejected?

### Research checkpoint — COMPLETE 2026-08-09

Durable research: `docs/research/LAYER2_COMMERCIAL_DELIVERY_GRAPH_RESEARCH_2026-08.md`.

Validated wedge:

> **Commercial provenance is a first-class property of delivery work. Every material client-deliverable work item can point to the effective baseline commitment or confirmed commercial decision that authorizes it, while missing/stale relationships are surfaced before capacity is silently consumed.**

Logical graph:

`Project → Commercial baseline → Baseline version → Commercial scope item`

Evidence:

`Scope item / Request / Decision → Evidence anchor → Commercial evidence source`

Change control:

`Client request → Effective commercial decision → Commercial basis relationship → Work item`

Amendments:

`Baseline version N → version N+1 + scope-item lineage`, preserving historical work/decision relationships.

Minimum commercial dispositions:

- `covered`;
- `absorbed`;
- `swap`;
- `paid_change`;
- `deferred`;
- `rejected`.

Minimum work-purpose classification:

- `unclassified`;
- `client_delivery`;
- `delivery_support`;
- `internal`.

Document ingestion supports pasted text, text-based PDF and DOCX with deterministic extraction/evidence anchors. AI semantic extraction and OCR remain later/optional.

Layer 2 was implemented through SC-006A/B/C (#30/#31/#32) and completed with PR #35 / merge `8daa8360799f870d3280c3146565c873c2f9f552`.

Required Layer-2 behavior is Local/LAN with no mandatory AI/OCR/document SaaS/paid provider.

## Layer 3 — Client Collaboration & Negotiation — RESEARCH COMPLETE / IMPLEMENTATION ACTIVE

### Outcome
Clients participate in the same authoritative commercial/delivery lifecycle without seeing the internal engineering workspace or forcing PMs to copy project truth into a separate portal.

### Research checkpoint — COMPLETE 2026-08-10

Durable research: `docs/research/LAYER3_CLIENT_COLLABORATION_RESEARCH_2026-08.md`.

Competitor/workflow research found that generic client seats, guest permissions, branded portals, request intake and approval buttons are already common. A generic portal is table stakes, not the ScopeDelta wedge.

### Validated Layer-3 USP

> **One commercial truth, two projections. The delivery team works from the internal project and Commercial Delivery Graph; the client sees only the requests, commitments, decisions, impacts and acceptance actions relevant to them. Every client action is tied to the exact commercial or delivery version they saw.**

Core relationship:

`Client request → internal commercial treatment → immutable client-visible packet → client action/evidence → delivery commercial basis → delivery acceptance/history`

### External participant model

Ongoing client access is authenticated and project-scoped. External participants are not normal workspace members.

Initial roles/capabilities:

- **Client collaborator** — client-safe project visibility, request/clarification participation and external-safe discussion.
- **Client approver** — collaborator capabilities plus commercial and delivery-acceptance actions.

No generic guest-permission builder in Layer 3.

### Client-safe projection

The client home prioritizes:

- `Needs your attention`;
- selected milestone/deliverable status;
- client requests and client-safe lifecycle;
- published commercial packet versions/actions;
- delivery acceptance targets/actions.

The internal board, work-item details, estimates, private comments/notes, commercial drift, internal commercial rationale, unconfirmed impacts, workspace directory, private source documents, AI metadata and later Git/QA detail remain hidden by default.

### Commercial publication/action defaults

Commercial information affecting money, timeline or deliverables requires explicit publication. Published client packets are immutable/versioned; later edits create successor versions.

Default client action:

- `covered` — informational; clarification available;
- `absorbed` — informational/goodwill; clarification available;
- `swap` — approve/reject/request clarification;
- `paid_change` — approve/reject/request clarification;
- `deferred` — informational; clarification available;
- `rejected` — informational; clarification available.

Internal commercial treatment and client acceptance are distinct evidence states.

### Runtime conclusion

Core Layer-3 behavior is **Local/LAN**. Outbound email is **Hybrid/optional external**; managed ScopeDelta Cloud email or customer SMTP/local mail may be used, and self-host can manually distribute generated invitation/action URLs.

Layer 3 introduces **no mandatory paid external provider**.

External client participants should not consume normal paid internal employee seats; exact hosted pricing/limits remain SC-010/founder scope.

### SC-007 / #11 — consolidated Layer-3 implementation — READY FOR CODEX

SC-007 is intentionally one engineering issue and one primary PR. The previously proposed SC-007A/B/C issues #36/#37/#38 are closed as superseded. Their boundaries remain useful internal implementation phases only:

**Phase 1 — external boundary/project home/request intake**
- project-scoped external participants;
- collaborator/approver capability foundation;
- invite/accept/revoke lifecycle;
- strict external authorization;
- client-safe project home and selected milestone/deliverable projection;
- client-native request/clarification intake into SC-006B.

**Phase 2 — commercial publication/client actions**
- immutable packet versions and successor/supersession behavior;
- selected confirmed money/schedule/deliverable projection;
- paid-change/swap approve/reject/clarify;
- informational covered/absorbed/deferred/rejected projection;
- actor/time/version evidence;
- stale-version/idempotent/concurrent action safety;
- external-safe discussion.

**Phase 3 — delivery acceptance/hardening**
- versioned milestone/deliverable acceptance;
- client-visible history/discussion hardening;
- durable external notification/inbox behavior;
- optional outbound email/recovery;
- multiple contacts/approvers;
- cross-client/project security, scale and complete browser journey.

Codex should keep these phases in one coherent implementation unless it discovers a concrete technical reason that satisfies the delivery-speed split rule above.

### Layer-3 exit criteria

SC-007 is complete and product-reviewed. A client can securely access only their intended project projection, submit requests, act on immutable commercial packet versions, and accept/request changes on delivered outcomes. Internal commercial treatment, client acceptance and delivery history remain distinguishable and reconstructable. Required behavior runs on ScopeDelta Cloud and self-host/LAN without mandatory paid external services.

## Layer 4 — Engineering & QA Delivery Loop

### Outcome
Planning, implementation, QA and acceptance form one traceable delivery chain.

### Status
Blocked until Layer 3 is complete and the required SC-008 research checkpoint is performed.

### Scope direction
- GitHub integration first, GitLab when justified;
- work ↔ branch/commit/PR/CI evidence;
- bugs/defects and lightweight QA verification;
- requirement/acceptance-criteria coverage;
- release readiness;
- trace requested → commercially authorized → planned → implemented → tested → accepted.

Do not build Git hosting or a CI/CD runner platform.

## Layer 5 — AI-Native Delivery Intelligence

### Outcome
AI reduces coordination work across PM, developer, QA, commercial and client roles instead of acting as an isolated chatbot.

### Scope direction
- semantic scope/request comparison with evidence;
- structured requirement/work generation;
- PM hygiene/risk/replanning assistance;
- developer context and ambiguity detection;
- QA test/risk/coverage assistance;
- client-safe summaries;
- bounded agent actions with permission/audit rules;
- managed AI plus BYO/local paths where practical;
- evaluation, retry/idempotency and cost controls.

## Layer 6 — Subscription, Cloud Economics & Source Distribution

### Outcome
ScopeDelta can grow without founder-funded variable costs while supporting useful free self-hosting and a protected managed-cloud business.

### Scope direction
- self-host packaging/upgrade path;
- managed cloud onboarding;
- recurring billing/entitlements;
- managed AI/storage/email/processing allowances;
- usage enforcement and operational cost controls;
- source/package boundaries aligned with LIC-001.

Exact source-license/public-package boundary, public prices/allowances, live billing-provider commitments and legal/customer terms require explicit founder approval before activation.

## Layer 7 — Portfolio, Operations & Self-Service Scale

### Outcome
Larger 50–500-person organizations can operate many concurrent projects with low administrative burden.

### Scope direction
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

### Scope direction
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
5. **Desktop client** — client-side feature using shared server/domain rules.

`docs/FEATURE_RUNTIME_MATRIX.md` is the durable inventory and RS-002 maintains it.

Current validated totals after Layer-3 research:

- Total planned capability units: 98
- Local/LAN: 63
- Hybrid/optional external: 23
- External API/service: 4
- Managed-cloud only: 4
- Desktop client: 4 runtime-class capabilities

## Competitive product rule

Before implementing a major feature, classify it as:

1. **Table stakes** — necessary to replace the incumbent for daily use.
2. **Differentiator** — advances commercial/delivery traceability, client-delivery workflow or AI-native coordination advantage.
3. **Later enterprise capability** — useful at scale but not needed now.
4. **Do not build** — mature external infrastructure we should integrate instead.

Table-stakes features should be implemented simply. Differentiators deserve disproportionate product/research effort.

## Engineering sequencing

GitHub issues are the executable source of truth. **Exactly one highest-priority unblocked engineering issue should be `READY FOR CODEX` at a time.**

Current sequence:

1. SC-004 / #8 — Layer 0 Platform Kernel — **DONE**.
2. SC-005 / #9 — Layer 1 Delivery Core — **DONE**.
3. SC-006 / #10 — Layer 2 Commercial Delivery Graph — **DONE**.
4. SC-007 / #11 — Layer 3 client collaboration/negotiation/acceptance — **READY FOR CODEX** as one consolidated task/primary PR.
5. SC-008 / #12 — Layer 4 engineering/QA evidence — blocked until Layer 3 completion + research.
6. SC-009 / #17 — Layer 5 AI-native delivery intelligence.
7. SC-010 / #13 — Layer 6 subscription/cloud economics/source distribution.
8. SC-011 / #14 — Layer 7 portfolio/operations/self-service scale.
9. SC-012 / #15 — Layer 8 enterprise/GA hardening.

Superseded planning issues #36/#37/#38 are closed and should not be implemented separately.

Cross-cutting:

- #28 quality/Sonar/secret-scanning follow-up remains **P1 and separate/non-blocking** unless it exposes a new unwaived security/reliability regression.
- DX-001 desktop remains a later cross-cutting client track unless new evidence changes priority.
- ARCH-001 maintains runtime topology.
- RS-002 maintains feature/runtime/cost classification.
- LIC-001 is the founder/legal gate before public core-source release.