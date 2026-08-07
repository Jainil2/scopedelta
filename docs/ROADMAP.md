# ScopeDelta Layered Production Roadmap

This roadmap builds ScopeDelta as an AI-native client software delivery operating system for 50–500-person software service organizations.

The product is built layer by layer. Each layer must be useful, secure and production-quality before downstream layers rely on it. We are not attempting to clone every Jira/Linear feature before shipping differentiation.

## Completed foundation

Already complete:

- deployable Next.js application foundation;
- CI, lint/typecheck/test/build gates;
- public landing page;
- production Netlify deployment and basic operations runbook.

These are technical/marketing foundations only. They are not the delivery product.

## Layer 0 — Platform Kernel

### Outcome
A production-capable cloud/self-host-compatible multi-tenant kernel that future delivery features can safely build on.

### Scope
- self-service authentication and recovery;
- organizations/workspaces and membership;
- initial role/permission model;
- durable production database and migrations;
- strict tenant isolation;
- audit/event foundation;
- stable identifier/time conventions;
- server API/service boundaries and webhook/event conventions;
- entitlement/feature hooks for later cloud plans;
- environment/configuration conventions that work for managed cloud and self-hosted deployments;
- production operations documentation.

### Exit criteria
A fresh production-like environment can create accounts/workspaces, persist tenant-owned records and prove cross-tenant isolation through automated negative tests.

## Layer 1 — Delivery Core

### Outcome
A software-delivery team can manage normal client project work in ScopeDelta without needing Jira/Linear for basic issue/project tracking.

### Scope
- clients and engagements;
- projects;
- milestones/releases;
- cycles/sprints where enabled;
- work items/subtasks;
- assignments, priority, estimates and dependencies;
- acceptance criteria;
- configurable but opinionated statuses/workflows;
- list and board views first; additional views only when justified;
- comments, activity and explicit decisions;
- lightweight project/specification pages;
- filtering, search and personal/project action views;
- useful defaults for software delivery rather than a blank workflow builder.

### Differentiating requirement
Even before the full Commercial Delivery Graph exists, domain relationships must be ready to connect work to client requests, requirements, scope and approvals later. Do not build a generic issue tracker with no client-delivery semantics.

### Exit criteria
A real software project can be planned and executed through milestones/cycles/work items with clean role-aware daily workflows and no cross-tenant leakage.

## Layer 2 — Commercial Delivery Graph

### Outcome
ScopeDelta becomes meaningfully different from generic PM systems: commercial intent and delivery execution stay connected.

### Scope
- versioned proposal/SOW/scope baselines;
- secure source/document ingestion;
- evidence-backed requirements, deliverables, exclusions, assumptions and revision limits;
- client request/change records;
- commercial decision taxonomy: included, defect/fix, revision allowance, absorb, swap, defer, paid change, clarify, reject;
- links between commercial decisions and work items;
- traceability across scope versions;
- commercially unlinked work detection;
- warning-by-default drift UX;
- configurable stricter gates as a later policy capability;
- impact fields for effort/schedule/commercial consequences with facts separated from estimates.

### Exit criteria
A PM can answer why each material delivery item exists commercially, and ScopeDelta can surface work that has no approved commercial parent.

## Layer 3 — Client Collaboration & Negotiation

### Outcome
Client interaction becomes part of the same system without exposing the internal engineering workspace.

### Scope
- secure project-specific client portal;
- client request/clarification intake;
- client-safe status/milestones;
- commercial decision/change proposal packets;
- approve/reject/request-clarification;
- deliverable/milestone acceptance;
- immutable shared versions and audit history;
- notifications and recovery;
- client-safe vocabulary/content separate from internal technical detail.

### Exit criteria
A client can request, understand, review and approve relevant delivery/commercial changes without receiving an internal employee seat or seeing unrelated internal data.

## Layer 4 — Engineering & QA Delivery Loop

### Outcome
Planning, implementation, QA and acceptance form one traceable delivery chain.

### Scope
- GitHub integration first, followed by GitLab when justified;
- link work items to branches/commits/pull requests and CI state;
- implementation/review readiness;
- bugs/defects;
- test cases/checklists or equivalent lightweight QA evidence;
- requirement/acceptance-criteria coverage;
- release/environment state where useful;
- trace requested → planned → implemented → tested → accepted.

### Boundary
Do not build Git hosting or general CI/CD infrastructure in these layers. Integrate mature systems.

### Exit criteria
A PM/developer/QA/client can trace a meaningful requirement or approved change through implementation, verification and acceptance.

## Layer 5 — AI-Native Delivery Intelligence

### Outcome
AI reduces coordination work across PM, developer, QA, commercial and client roles instead of acting as an isolated chatbot.

### Scope
- structured requirement/work generation from messy input with citations;
- commercial/scope reasoning against the graph;
- PM backlog hygiene, dependency/risk and replanning assistance;
- developer context/requirement retrieval and ambiguity detection;
- QA test/risk/coverage assistance;
- client-safe progress and change explanations;
- project health summaries based on actual graph state;
- drift/risk alerts;
- bounded agent actions with permission/audit rules;
- idempotent async execution and retries;
- model/provider abstraction supporting managed AI and BYO/local options where practical;
- per-tenant usage/cost accounting and hard limits.

### Exit criteria
AI demonstrably removes repetitive project-management/translation work while every material action remains attributable, reviewable and economically bounded.

## Layer 6 — Subscription, Cloud Economics & Distribution

### Outcome
ScopeDelta can grow without founder-funded variable costs and can distribute through both self-hosted community and managed cloud.

### Scope
- community/self-host packaging and upgrade path;
- automated cloud onboarding;
- recurring billing in supported markets;
- centrally configured plans/entitlements;
- managed-AI/storage/email/processing allowances;
- usage enforcement;
- hosted billing management/cancellation;
- failed-payment/grace behavior;
- cloud operational limits and cost alerts;
- no routine manual entitlement changes.

### Commercial principle
Avoid depending solely on seat-based pricing. Evaluate active client projects/delivery capacity plus managed AI/usage as primary economic units.

### Founder gates
Exact open-source license, public plan prices, included allowances, live billing provider/account activation and legal/customer terms require explicit founder approval before public activation.

## Layer 7 — Portfolio, Operations & Self-Service Scale

### Outcome
Larger 50–500-person organizations can operate many concurrent projects with low administrative burden.

### Scope
- multi-project/portfolio health;
- capacity/workload visibility;
- project budget/margin visibility where trustworthy inputs exist;
- reusable templates/standards;
- onboarding/checklists and excellent empty states;
- account/workspace/billing/data lifecycle self-service;
- in-product help and recoverable errors;
- advanced search/reporting focused on action rather than vanity dashboards;
- organization-level policy controls only where real workflow needs justify them.

### Exit criteria
Routine user onboarding, project setup, delivery, billing and recovery do not require founder intervention.

## Layer 8 — Enterprise & General-Availability Hardening

### Outcome
The product is safe and reliable for paying production customers at increasing scale.

### Scope
- full tenant-isolation audit;
- public/client endpoint security review;
- authorization/RBAC review;
- data lifecycle, deletion and retention;
- backup/recovery expectations;
- provider outage and retry behavior;
- webhook/event idempotency;
- monitoring/alerts/privacy-safe telemetry;
- rate/abuse/cost controls;
- end-to-end tests for revenue-critical workflows;
- load/performance testing against realistic customer/project/work-item volumes;
- migration/rollback/incident runbooks;
- SSO/SCIM/audit export/data-residency capabilities only as required for initial enterprise readiness.

### Exit criteria
Known production risks are documented and acceptable, critical workflows are automated/tested, and normal customer operations require minimal founder attention.

## Competitive product rule

Before implementing a major feature, classify it as one of:

1. **Table stakes** — necessary to replace the incumbent for daily use.
2. **Differentiator** — advances the Commercial Delivery Graph, client-delivery workflow or AI-native coordination advantage.
3. **Later enterprise capability** — useful at scale but not needed for the current layer.
4. **Do not build** — mature external infrastructure we should integrate instead.

Table-stakes features should be implemented simply. Differentiators deserve disproportionate product/research effort.

## Engineering sequencing

GitHub issues are the executable source of truth. Exactly one highest-priority unblocked issue should be `READY FOR CODEX` at a time.

Current intended sequence:

1. SC-004 — Layer 0 Platform Kernel
2. SC-005 — Layer 1 Delivery Core
3. SC-006 — Layer 2 Commercial Delivery Graph
4. SC-007 — Layer 3 Client Collaboration & Negotiation
5. SC-008 — Layer 4 Engineering & QA Delivery Loop
6. SC-009 — Layer 5 AI-Native Delivery Intelligence
7. SC-010 — Layer 6 Subscription, Cloud Economics & Distribution
8. SC-011 — Layer 7 Portfolio, Operations & Self-Service Scale
9. SC-012 — Layer 8 Enterprise & GA Hardening

This sequence may be split into smaller executable issues as implementation evidence requires; the layers are product boundaries, not permission for giant PRs.
