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

Its Layer-2 wedge is more precise:

> **Commercial provenance is a first-class property of delivery work. Every material client-deliverable work item can point to the effective baseline commitment or confirmed commercial decision that authorizes it; missing or stale relationships are surfaced before capacity is silently consumed.**

The graph eventually connects:

- client/engagement;
- commercial evidence sources;
- signed scope and baseline versions/amendments;
- requirements, deliverables, exclusions and constraints;
- client requests/clarifications;
- explicit commercial decisions and impacts;
- project milestones, cycles and work items;
- repository/PR/CI evidence from integrations;
- QA/test/defect evidence;
- client approval/acceptance;
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

### Layer 2 — Commercial Delivery Graph

ScopeDelta's primary wedge. Research checkpoint completed 2026-08-09; durable detail is in `docs/research/LAYER2_COMMERCIAL_DELIVERY_GRAPH_RESEARCH_2026-08.md`.

#### Commercial evidence and baseline

- immutable private commercial evidence sources from pasted text, text-based PDF and DOCX;
- deterministic extraction/storage and evidence anchors without semantic AI inference;
- logical commercial baseline with immutable versions/amendments;
- evidence-backed commercial scope items with minimum kinds `deliverable`, `requirement`, `exclusion`, `constraint`;
- prior versions/history never rewritten by later amendments.

#### Client request lifecycle

A client request is a commercial question, not authorization by itself.

Minimum request states:

- `open`;
- `needs_clarification`;
- `resolved`;
- `withdrawn`.

`needs_clarification` is workflow state, not a commercial decision.

#### Commercial decisions

Minimum effective dispositions:

- `covered` — current agreement already obligates the work;
- `absorbed` — provider knowingly accepts incremental unbilled work;
- `swap` — changed/new work is accepted against explicit reduced/removed existing commitment;
- `paid_change` — incremental work is commercially authorized as additional paid scope;
- `deferred` — not authorized for the current scope/phase;
- `rejected` — explicitly not to perform.

For `covered`, preserve an optional basis such as baseline, defect/warranty, revision allowance, or other existing obligation.

Direct work-to-baseline scope links are valid provenance and do not require redundant `covered` decisions for every original ticket.

#### Work provenance and drift

Minimum work-purpose states:

- `unclassified`;
- `client_delivery`;
- `delivery_support`;
- `internal`.

`client_delivery` work is expected to have an effective commercial basis: one or more current/effective baseline scope items and/or confirmed commercial decisions. Client-delivery work without one is **commercially unlinked**.

`unclassified` is a lower-severity hygiene state. `delivery_support` and `internal` work do not receive high-severity drift warnings merely because they lack a direct commercial link. This prevents normal refactoring, QA infrastructure, administration and technical enablement from becoming false-positive scope creep.

Warnings are advisory by default; they do not silently block delivery. Optional stricter organization policy remains later scope.

#### Impact/history

- optional effort, schedule and monetary impact on requests/decisions;
- estimates are explicitly separated from confirmed facts/commitments;
- money is exact-decimal + currency-code safe;
- no autonomous binding price/date decisions;
- amendments preserve lineage to previous baseline/items and decisions;
- historical work remains explainable against the commercial basis effective when it was authorized/performed.

#### Layer-2 document/AI boundary

Layer 2 supports deterministic validation, private storage, text extraction and evidence anchors for paste/text-PDF/DOCX. Humans curate commercial scope items and decisions.

Scanned/image OCR, semantic SOW extraction, automated request decomposition, AI in/out-of-scope verdicts, impact estimation and generated change-order prose are not required for Layer 2. SC-009 owns the AI-native intelligence layer after the durable graph exists.

### Layer 3 — Client Collaboration & Negotiation

A client-safe experience built into the same project rather than exposing the internal board directly:

- client request/clarification channel;
- client-facing project status and milestones;
- scope/change negotiation packets;
- secure approve/reject/request-clarification flows;
- deliverable/milestone acceptance;
- immutable shared versions and audit history;
- client-safe terminology separated from internal technical detail.

### Layer 4 — Engineering & QA Delivery Loop

Connect delivery planning with engineering evidence without rebuilding source-control infrastructure:

- GitHub/GitLab repository integration;
- link work items to branches, commits, pull/merge requests and CI state;
- development/review/release readiness;
- bugs/defects and test evidence;
- requirement/acceptance-criteria coverage;
- trace requested → commercially authorized → planned → implemented → tested → accepted.

ScopeDelta does not initially host Git repositories or build its own CI/CD runner platform.

### Layer 5 — AI-Native Delivery Intelligence

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

AI may propose classifications/actions but may not fabricate commercial authorization or completion evidence.

### Layer 6 — Subscription, Cloud Economics & Source Distribution

- useful self-host packaging and upgrade path;
- managed-cloud provisioning/operations;
- recurring billing and provider-neutral entitlements;
- managed AI/storage/email/background-processing allowances;
- cost/usage limits and observability;
- source/package boundaries aligned with LIC-001.

### Layer 7 — Portfolio, Operations & Self-Service Scale

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

A first-party Windows/macOS/Linux client is planned, but it must use the same server/domain/API authorization rules as web rather than becoming a separate backend/product. It does not preempt the Commercial Delivery Graph without new evidence.

### ScopeDelta Cloud

ScopeDelta operates the server, database, persistent source/file storage as needed, upgrades, backups, managed AI, notifications/integration workers and observability subject to plan limits.

### Self-hosted / private server

A customer can run the same ScopeDelta core on its own server/VPC/private network. Core Local/LAN-class capabilities, including required Layer-2 Commercial Delivery Graph behavior, must not require ScopeDelta Cloud.

### LAN/private team deployment

A 50–500-person company may run one shared ScopeDelta server/database on its office/private infrastructure. Web and future desktop clients connect to that server over the organization's LAN/VPN/network controls. The server remains authoritative for collaborative project/commercial/audit state.

### Air-gapped direction

Later enterprise/private deployments may replace external SaaS dependencies with local equivalents. Air-gapped support is not promised until production hardening validates it.

See `docs/FEATURE_RUNTIME_MATRIX.md` and `docs/research/DEPLOYMENT_RUNTIME_LICENSE_THESIS_2026-08.md`.

## Role-specific product value

### Project / delivery manager

Less manual translation, backlog cleanup, status reporting, chasing approvals and reconstructing why work exists.

### Account / commercial owner

Clear relationship between agreement, requested changes, explicit treatment, delivery impact and client acceptance.

### Developer

Clean actionable work with current context and compact commercial provenance without requiring contract reading.

### QA / tester

Direct traceability from requirement/change to acceptance criteria, implementation and verification state.

### Client

A simple client-safe project surface for requests, decisions, progress and approvals instead of access to an internal engineering tool.

## Product principles

### Innovation over feature count

Do not clone incumbents screen-for-screen. Build the minimum daily-work primitives required to replace them, then invest in handoffs and commercial/delivery intelligence incumbents do poorly.

### Tech-first

APIs, events, auditability, integrations and AI execution boundaries are first-class architecture.

### Simple by default

The product should feel closer to Linear's speed/opinionated workflow than Jira's configuration burden. Advanced configurability should be earned by real customer need.

### Premium reliability at disruptive cost

Low price must come from efficient architecture, open-source components, self-service operations and automation—not from unreliable behavior or weak security.

### Open-dependency / self-host-first distribution

Prefer open-source dependencies, open standards and self-hostable infrastructure when they meet production requirements.

The ScopeDelta product core itself is **not yet committed to an OSI-open-source license**. The current business requirement is a genuinely useful free/self-hosted path while protecting the managed-cloud business from direct commercial cloning. Until LIC-001 is resolved, describe the intended core distribution as **self-hosted/community/source-available direction**, not guaranteed open source.

Where practical, self-hosted customers should be able to bring their own AI provider or local model. Managed cloud can bundle AI and operational services.

### Global architecture

Core domain models must support global customers, currencies, time zones and regional deployment needs without country-specific assumptions.

### Human authority

AI may recommend and take bounded operational actions, but binding commercial commitments, client-visible approvals and destructive actions remain governed by authorized users/policies.

## Commercial model direction

The intended model is:

- useful self-hosted/community product at no software license cost for permitted internal use under the eventual license;
- low-friction hosted entry option;
- recurring managed-cloud revenue;
- usage limits that cover managed AI/storage/email/background-processing economics;
- higher-value business/enterprise governance and managed capabilities.

Avoid relying exclusively on per-seat pricing. For 50–500-person delivery organizations, a working hypothesis is to price managed cloud around active client-delivery capacity plus managed AI/usage, with generous collaboration/client access. Exact pricing is not yet approved.

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

## Production release principle

A landing page or isolated AI demo is not a product release.

Each capability layer must be production-quality before it becomes a dependency of the next layer. General availability requires a coherent self-service workflow with tested tenant isolation, recoverability, observability, cost controls and no routine founder intervention.

## Durable decisions

See:

- `docs/decisions/ADR-004-self-serve-production-saas.md`
- `docs/decisions/ADR-005-ai-native-client-delivery-os.md`
- `docs/research/MARKET_PROBLEM_THESIS_2026-08.md`
- `docs/research/LAYER1_DELIVERY_CORE_RESEARCH_2026-08.md`
- `docs/research/LAYER2_COMMERCIAL_DELIVERY_GRAPH_RESEARCH_2026-08.md`
- `docs/research/DEPLOYMENT_RUNTIME_LICENSE_THESIS_2026-08.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- SC-006 / #10 and SC-006A/B/C / #30/#31/#32
- LIC-001
- ARCH-001
- DX-001
