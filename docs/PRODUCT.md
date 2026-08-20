# ScopeDelta Product Definition

## Category

**ScopeDelta is an AI-native client software delivery operating system for software service companies.**

It combines an opinionated daily delivery workspace with a differentiated Commercial Delivery Graph that connects what was sold, what the client asks for, what the team builds, what QA verifies, and what the client approves.

## Mission

Help software delivery organizations run client projects with less tool fragmentation, less project-manager busywork, fewer misunderstood requirements, earlier risk detection, and substantially less commercial drift.

## Primary ICP

Initial target: software development agencies, consultancies, outsourcing/product-engineering companies, and similar B2B software-delivery organizations with roughly **50–500 employees**.

Strong-fit organizations typically:

- run multiple client projects concurrently;
- have separate project/account managers, developers and QA/testers;
- use fixed-price, milestone, retainer, time-and-materials, or mixed commercial models;
- coordinate delivery across project tools plus documents, chat, email and repositories;
- need clients to see and approve the right information without exposing internal delivery noise;
- suffer when requirements, status, scope, QA and commercial decisions become disconnected across systems.

The initial product is designed for client software delivery. It is not a generic all-industry ERP.

## Core customer problem

The daily problem is broader than scope creep: **delivery context fragments across the entire project lifecycle**.

Common failure pattern:

1. sales/proposal/SOW defines one version of the project;
2. client requests and clarifications arrive later in different channels;
3. PMs translate those requests into work items manually;
4. developers and testers operate from a delivery backlog that may no longer match the commercial agreement;
5. clients receive manually translated status updates because internal tickets are too technical or expose inappropriate detail;
6. QA, acceptance and commercial approvals live in separate places;
7. leaders discover schedule, margin or expectation drift after work has already been consumed.

Current tools solve portions of this workflow. ScopeDelta's opportunity is to keep those layers continuously connected.

## Product thesis

### Daily-use thesis

A team should be able to use ScopeDelta as its primary project/delivery workspace instead of maintaining ScopeDelta beside Jira or Linear merely for scope checks.

### Differentiating thesis

> **ScopeDelta prevents unapproved or misunderstood client scope from silently becoming delivery work.**

The differentiated system is the **Commercial Delivery Graph**.

Its core commercial wedge is:

> **Commercial provenance is a first-class property of delivery work. Every material client-deliverable work item can point to the effective baseline commitment or confirmed commercial decision that authorizes it; missing or stale relationships are surfaced before capacity is silently consumed.**

Its validated Layer-3 client-collaboration extension is:

> **One commercial truth, two projections. The delivery team works from the internal project and Commercial Delivery Graph; the client sees only the requests, commitments, decisions, impacts and acceptance actions relevant to them. Every client action is tied to the exact commercial or delivery version they saw.**

The graph eventually connects:

- client/engagement;
- commercial evidence sources;
- signed scope and baseline versions/amendments;
- requirements, deliverables, exclusions and constraints;
- client requests/clarifications;
- explicit commercial decisions and impacts;
- client-visible publication versions and client actions;
- project milestones, cycles and work items;
- repository/PR/CI evidence from integrations;
- QA/test/defect evidence;
- client delivery acceptance;
- audit history.

The graph data structure itself is not the USP. The USP is the opinionated commercial meaning of those relationships inside the daily software-service delivery workflow.

## Product capability layers

The product is intentionally built in layers. A later layer may depend on earlier layers, but earlier layers must remain useful and production-quality on their own.

### Layer 0 — Platform Kernel

Foundation required by every other capability:

- account/authentication and recovery;
- organization/workspace tenancy;
- roles/permissions and strict tenant isolation;
- production persistence and migrations;
- audit/event model;
- API/webhook boundaries;
- feature/entitlement hooks;
- cloud + self-host portability;
- security, secrets and operational foundations.

### Layer 1 — Delivery Core — COMPLETE

The minimum product capable of replacing basic Jira/Linear-style day-to-day project tracking for the target ICP:

- clients and engagements;
- projects and project membership;
- milestones/releases;
- optional cycles/sprints;
- work items, subtasks, dependencies and first-class acceptance criteria;
- assignments, priority, estimates and statuses;
- list/backlog, board, filtering/search and cross-project `My work`;
- comments, activity, lightweight project context;
- mentions, subscriptions and durable in-app notifications;
- clean internal project workflows with excellent defaults.

Canonical delivery spine:

`Workspace → Client → Project → Milestone → Work item`

Optional planning overlay:

`Project → Cycle → Work item`

### Layer 2 — Commercial Delivery Graph — COMPLETE

Durable research: `docs/research/LAYER2_COMMERCIAL_DELIVERY_GRAPH_RESEARCH_2026-08.md`.

Layer 2 provides:

- immutable private commercial evidence from pasted text, text-based PDF and DOCX;
- deterministic extraction/storage and evidence anchors;
- logical commercial baseline with immutable versions/amendments;
- evidence-backed commercial scope items (`deliverable`, `requirement`, `exclusion`, `constraint`);
- client request lifecycle (`open`, `needs_clarification`, `resolved`, `withdrawn`);
- commercial dispositions (`covered`, `absorbed`, `swap`, `paid_change`, `deferred`, `rejected`);
- optional exact effort/schedule/money impacts with estimates separated from confirmed values;
- work-purpose classification (`unclassified`, `client_delivery`, `delivery_support`, `internal`);
- baseline/decision commercial-basis links to delivery work;
- commercially-unlinked and stale-basis advisory drift;
- amendment/scope-item lineage and historical reconstruction.

Direct work-to-baseline scope links are valid provenance and do not require redundant `covered` decisions for every original ticket.

Warnings are advisory by default; they do not silently block delivery.

Layer 2 remains Local/LAN and does not require semantic AI, OCR SaaS, e-signature, CRM, billing or another paid provider.

### Layer 3 — Client Collaboration & Negotiation — COMPLETE

Durable research: `docs/research/LAYER3_CLIENT_COLLABORATION_RESEARCH_2026-08.md`.

#### Product boundary

A generic branded portal, guest account or approval button is table stakes. ScopeDelta's client surface exists to project the Commercial Delivery Graph safely and precisely to clients without duplicating state.

The core Layer-3 chain is:

`Client request → internal commercial treatment → immutable client-visible packet → client action/evidence → delivery commercial basis → delivery acceptance/history`

#### External identity

Ongoing collaboration uses authenticated, account-backed **project-scoped external participants**. They do not become normal internal workspace members.

Initial external capabilities:

- **Client collaborator** — client-safe project visibility, request/clarification participation and external-safe discussion where enabled.
- **Client approver** — collaborator capabilities plus commercial decision and delivery-acceptance actions.

Avoid a generic permission-set builder.

#### Client-safe project surface

The client experience prioritizes:

- `Needs your attention`;
- selected client-visible milestones/deliverables;
- client request/clarification history;
- published commercial packet versions/actions;
- delivery acceptance targets/actions;
- client-visible discussion/activity where appropriate.

Do not expose the internal backlog/board by default.

Internal-only by default:

- work-item/subtask/dependency detail;
- internal estimates, capacity/workload;
- internal comments/notes/activity;
- commercial drift warnings;
- provider-only commercial rationale;
- unconfirmed impacts;
- workspace directory/admin;
- private commercial source bodies/evidence unless explicitly shared;
- AI/provider metadata;
- later Git/CI/QA detail unless explicitly projected.

#### Client request intake

Client-native requests enter the existing SC-006B request lifecycle. A request starts `open` and never authorizes delivery by itself. `needs_clarification` remains request state, not approval.

#### Commercial publication

Money/timeline/deliverable commitments are client-visible only after explicit authorized publication. A published client packet is an immutable/versioned target; later edits create a successor version.

Default client action:

- `covered` — informational; clarification available;
- `absorbed` — informational/goodwill; clarification available;
- `swap` — approve/reject/request clarification;
- `paid_change` — approve/reject/request clarification;
- `deferred` — informational; clarification available;
- `rejected` — informational; clarification available.

Internal commercial treatment, publication, client action, current delivery authorization and later amendment history remain distinct facts. ScopeDelta must never fabricate client approval from an internal decision.

#### Delivery acceptance

An internal user can later publish a versioned milestone/deliverable acceptance target. An authorized client approver can accept or request changes against the exact target version. This is business delivery evidence, not legal e-signature/warranty certification.

#### Discussion boundary

Client-visible discussion exists on external-safe objects and remains structurally separate from internal comments/notes. Internal content must not become client-visible through accidental inheritance or a subtle visibility toggle.

#### Runtime/economics

Core Layer-3 state and actions are **Local/LAN**. Outbound email is **Hybrid/optional external**: ScopeDelta Cloud may provide managed delivery, while self-host can use customer SMTP/local mail or manually deliver generated invitation/action URLs.

Layer 3 requires no mandatory paid external provider.

External client participants should not consume normal paid internal employee seats. Exact hosted client limits/pricing remain a later SC-010/founder decision.

#### Delivery sequence

- SC-007 / #11 — one consolidated implementation and primary PR covering the
  external boundary, request intake, immutable commercial publication, client
  actions, delivery acceptance, notifications, and hardening.
- The former SC-007A/B/C issues #36/#37/#38 are closed as superseded. Their
  boundaries remain implementation phases within SC-007, not separate releases.

### Layer 4 — Engineering & QA Delivery Loop — COMPLETE

Durable research: `docs/research/LAYER4_ENGINEERING_QA_DELIVERY_LOOP_RESEARCH_2026-08.md`.

Connect delivery planning with engineering evidence without rebuilding source-control infrastructure:

- read-only GitHub App repository integration through a provider-neutral evidence boundary, with a signed workspace/user setup state and GitHub user authorization proving repository-administrator authority for the exact installation repository;
- manual and project-key links between work and pull-request evidence;
- current pull-request, head, review and check rollups plus immutable historical snapshots;
- lightweight manual/automated-reference QA verification and project defects;
- factual requirement, implementation, verification, defect and acceptance evidence gaps;
- trace requested → commercially authorized → planned → implemented → tested → accepted.

The local QA, defect, trace and readiness core remains useful with no provider connected. GitHub metadata is external evidence and is marked stale rather than deleted when access fails or is disconnected. Engineering and QA detail is internal-only and never inherits into the client projection.

ScopeDelta does not host Git repositories, execute CI, render a code-review/diff UI or become a full test-management system. GitLab remains deferred behind the provider boundary until customer evidence justifies it.

Layer 4 completed through SC-008 / PR #41.

### Layer 5 — AI-Native Delivery Intelligence — COMPLETE

Durable research: `docs/research/LAYER5_AI_NATIVE_DELIVERY_INTELLIGENCE_RESEARCH_2026-08.md`.

AI is a system layer, not a decorative chatbot:

- turn messy requests/specs into structured work with traceability;
- compare requests against commercial scope with citations and uncertainty;
- assist PMs with backlog hygiene, dependency/risk detection and replanning;
- provide developer context/requirement retrieval and ambiguity detection;
- assist QA with test scenarios, regression/risk and requirement coverage;
- produce client-safe status/change explanations;
- surface project health/drift from graph state;
- take bounded actions with permission, audit and cost controls;
- support managed AI plus BYO/local-model paths where practical.

SC-009 implements three internal jobs: Scope Change Analyst, Delivery Risk
Brief, and Work Context & QA Pack. Jobs use bounded immutable evidence
snapshots, server-issued citation keys, durable PostgreSQL attempts, explicit
retry/cancel, staleness fingerprints, and one deployment-selected OpenAI,
Anthropic, Gemini, or Ollama adapter. Scope candidates may create only
human-confirmed backlog/unclassified work and internal clarification drafts.
They never change commercial authorization, client publication, delivery
completion, or acceptance.

AI may propose classifications/actions but may not fabricate commercial authorization, client approval or completion evidence.

Layer 5 completed through SC-009 / PR #43 / merge `469fbe0b54f10246a776506612fe8b0785048db3`.

### Layer 6 — Subscription, Cloud Economics & Source Distribution — IMPLEMENTED FOR REVIEW

Durable research: `docs/research/LAYER6_CLOUD_ECONOMICS_DISTRIBUTION_RESEARCH_2026-08.md`.

SC-010 implements:

- repeatable production-oriented self-host packaging/upgrade/backup guidance;
- explicit self-host vs managed-cloud distribution mode with no cloud phone-home for Local/LAN core capability;
- centralized provider-neutral plan and effective-entitlement configuration;
- concurrency-safe active-project and optional internal-member capacity;
- managed-AI reservation/settlement and managed-email attempt enforcement;
- provider-neutral workspace subscription lifecycle and non-destructive grace/cancellation/expiry;
- Paddle sandbox hosted checkout, signed/idempotent webhook reconciliation, and hosted customer portal;
- owner billing/usage visibility plus bounded operator unit-economics export;
- source/package behavior that leaves public release and exact license text under LIC-001.

External client participants remain separate and non-billable by default. Browser checkout return never activates paid access. Final public plans/prices/allowances, live payments, and public source distribution remain founder/legal gates.

### Layer 7 — Portfolio, Operations & Self-Service Scale — PARTIALLY DELIVERED

SC-011A / #46 adds the Local/LAN operating core:

- an attention-first, filterable portfolio with evidence-linked overdue, request, commercial, dependency, implementation, defect, decision, acceptance, and provider-evidence signals—without a health score;
- effective-dated workspace/member weekly availability, explicit overlapping project allocations, and over-allocation derived from planned minutes above available minutes;
- owner-authored billable/non-billable delivery actuals, including work-item quick logging and soft-deletion audit evidence;
- permission-aware capacity projection that masks unrelated commitments from project leads;
- conservative project/workspace commercial exposure grouped by currency, with confirmed and pending impact separated and actual effort shown independently;
- no estimate-to-hours conversion and no fabricated baseline money, revenue, cost, profit, margin, or currency conversion.

ADR-013 records the operations and financial boundary. SC-011B/C remain future Layer-7 work.

- multi-project/portfolio health;
- capacity/workload;
- trustworthy project commercial/margin visibility where inputs support it;
- templates/organization standards;
- migration/import/export;
- self-service onboarding/admin/help/recovery;
- privacy-safe activation/reliability telemetry.

### Layer 8 — Enterprise & General-Availability Hardening

- complete tenant/client authorization review;
- data lifecycle, export/deletion/retention;
- backup/recovery and provider-outage handling;
- observability, cost/abuse controls and runbooks;
- representative 50–500-person load/security testing;
- end-to-end critical workflow tests;
- SSO/SCIM/advanced governance only when customer/launch evidence requires it.

## Product clients and deployment surfaces

### Web client

The browser experience is first-class and universal for ScopeDelta Cloud and customer-controlled servers. Client-facing project/approval surfaces remain web-native so an external client does not need to install software.

### Desktop client

A first-party Windows/macOS/Linux client is planned, but it uses the same server/domain/API authorization rules as web rather than becoming a separate backend/product.

### ScopeDelta Cloud

ScopeDelta operates the server, database, persistent source/file storage as needed, upgrades, backups, managed AI, managed outbound notifications/integration workers and observability subject to plan limits.

### Self-hosted / private server

A customer can run the same ScopeDelta core on its own server/VPC/private network. Core Local/LAN capabilities, including Layers 1–3 required product behavior, must not require ScopeDelta Cloud.

### LAN/private team deployment

A 50–500-person company may run one shared ScopeDelta server/database on office/private infrastructure. Web and future desktop clients connect over the organization's LAN/VPN/network controls. External client access requires the deployment to be network-reachable to those external participants through the customer's chosen network topology; it still does not require ScopeDelta Cloud.

### Air-gapped direction

Later enterprise/private deployments may replace external SaaS dependencies with local equivalents. Air-gapped support is not promised until production hardening validates it.

See `docs/FEATURE_RUNTIME_MATRIX.md` and `docs/research/DEPLOYMENT_RUNTIME_LICENSE_THESIS_2026-08.md`.

## Role-specific product value

### Project / delivery manager

Less manual translation, backlog cleanup, status reporting, chasing approvals and reconstructing why work exists.

### Account / commercial owner

Clear relationship between agreement, requested changes, explicit treatment, published client state, delivery impact and client acceptance.

### Developer

Clean actionable work with current context and compact commercial provenance without requiring contract reading or client-portal administration.

### QA / tester

Direct traceability from requirement/change to acceptance criteria, implementation and verification state.

### Client

A simple project-specific surface to request, understand, clarify, approve and accept the right things without being exposed to an internal engineering tool.

## Product principles

### Innovation over feature count

Do not clone incumbents screen-for-screen. Build the minimum daily-work primitives required to replace them, then invest in handoffs and commercial/delivery intelligence incumbents do poorly.

### Tech-first

APIs, events, auditability, integrations and AI execution boundaries are first-class architecture.

### Simple by default

The product should feel closer to Linear's speed/opinionated workflow than Jira's configuration burden. Advanced configurability should be earned by real customer need.

For clients specifically, `Needs your attention` and a small project projection are preferred over a miniature internal PM suite.

### Premium reliability at disruptive cost

Low price must come from efficient architecture, open-source components, self-service operations and automation—not from unreliable behavior or weak security.

### Open-dependency / self-host-first distribution

Prefer open-source dependencies, open standards and self-hostable infrastructure when they meet production requirements.

The ScopeDelta product core itself is **not yet committed to an OSI-open-source license**. The current business requirement is a genuinely useful free/self-hosted path while protecting the managed-cloud business from direct commercial cloning. Until LIC-001 is resolved, describe the intended core distribution as **self-hosted/community/source-available direction**, not guaranteed open source.

Where practical, self-hosted customers should be able to bring their own AI provider or local model. Managed cloud can bundle AI and operational services.

### Global architecture

Core domain models must support global customers, currencies, time zones and regional deployment needs without country-specific assumptions.

### Human authority

AI may recommend and take bounded operational actions, but binding commercial commitments, client-visible publications/approvals and destructive actions remain governed by authorized users/policies.

## Commercial model direction

The intended model is:

- useful self-hosted/community product at no software license cost for permitted internal use under the eventual license;
- low-friction hosted entry option;
- recurring managed-cloud revenue;
- usage limits that cover managed AI/storage/email/background-processing economics;
- higher-value business/enterprise governance and managed capabilities.

Avoid relying exclusively on per-seat pricing. For 50–500-person delivery organizations, a working hypothesis is to price managed cloud around active client-delivery capacity plus managed AI/usage, with generous collaboration/client access.

**External client participants should not consume normal paid internal employee seats.** Exact pricing/limits are not yet approved.

## Competitive boundary

ScopeDelta must be able to replace the **project/delivery management** role of Jira/Linear for its target workflow.

It should integrate with mature infrastructure rather than rebuild it where there is no strategic advantage, especially:

- source-code hosting;
- Git protocol/infrastructure;
- CI/CD execution platforms;
- cloud infrastructure providers;
- accounting/payment rails;
- video conferencing.

Layer 2 additionally avoids rebuilding PSA financial operations, CRM pipelines, contract lifecycle management, e-signature and generic requirements-management platforms.

Layer 3 additionally avoids a generic portal builder, generic guest-permission framework, creative proofing suite, legal e-signature system and public anonymous project portal.

Layer 4 additionally avoids Git hosting, CI execution, a code-review/diff surface, GitLab implementation and a generic test-case management suite.

## Production release principle

A landing page or isolated AI demo is not a product release.

Each capability layer must be production-quality before it becomes a dependency of the next layer. General availability requires a coherent self-service workflow with tested tenant/client isolation, recoverability, observability, cost controls and no routine founder intervention.

## Durable decisions

See:

- `docs/decisions/ADR-004-self-serve-production-saas.md`
- `docs/decisions/ADR-005-ai-native-client-delivery-os.md`
- `docs/research/MARKET_PROBLEM_THESIS_2026-08.md`
- `docs/research/LAYER1_DELIVERY_CORE_RESEARCH_2026-08.md`
- `docs/research/LAYER2_COMMERCIAL_DELIVERY_GRAPH_RESEARCH_2026-08.md`
- `docs/research/LAYER3_CLIENT_COLLABORATION_RESEARCH_2026-08.md`
- `docs/research/LAYER4_ENGINEERING_QA_DELIVERY_LOOP_RESEARCH_2026-08.md`
- `docs/research/DEPLOYMENT_RUNTIME_LICENSE_THESIS_2026-08.md`
- `docs/research/LAYER6_CLOUD_ECONOMICS_DISTRIBUTION_RESEARCH_2026-08.md`
- `docs/decisions/ADR-012-billing-entitlement-resource-boundary.md`
- `docs/SELF_HOST.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- SC-006 / #10 — complete
- SC-007 / #11 — consolidated Layer-3 implementation; #36/#37/#38 superseded
- SC-008 / #12 — consolidated Layer-4 engineering and QA delivery evidence
- LIC-001
- ARCH-001
- DX-001
