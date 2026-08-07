# ADR-005 — AI-Native Client Software Delivery OS

## Status

Accepted — founder strategy decision, 2026-08-07.

## Context

ScopeDelta started as a narrow scope-change/change-order product. Market research confirmed that scope creep and commercial drift are real problems, but the 2026 market already contains numerous narrow AI scope checkers and broader PM/PSA products. A standalone "upload SOW → classify request → generate change order" product is not sufficiently differentiated.

The founder also clarified that the intended company ambition is larger: build a production-grade, AI-first, low-cost software-delivery product that can become the primary operating system for client software delivery rather than a small add-on beside Jira or Linear.

## Founder decisions

The following product constraints are accepted:

1. Primary ICP: software development agencies, consultancies, outsourcing/product-engineering firms, and similar client-delivery organizations with roughly 50–500 employees.
2. ScopeDelta must be usable as a standalone delivery platform. Integrations with Jira/Linear may support migration/coexistence, but the long-term product should not depend on them for basic project management.
3. Commercial-drift detection should warn by default and allow stricter configurable delivery gates later; it must not silently block work by default.
4. Prefer open-source software, open standards, self-hostable components, local/BYO AI, and free/low-cost infrastructure whenever reliability and security are acceptable. Paid managed services are justified only when they materially improve production reliability or economics.
5. Product/data architecture is global from day one: no India-specific core data model, currency assumption, or workflow dependency.
6. Commercial positioning: low-cost/high-volume relative to incumbent B2B tools while maintaining premium product quality and production discipline.

## Product category

ScopeDelta will be built as an **AI-native client software delivery operating system**.

The narrow commercial wedge remains central:

> ScopeDelta prevents unapproved or misunderstood client scope from silently becoming delivery work.

But customers should use ScopeDelta every day because it also provides the core software-delivery workflow used by project managers, developers, QA/testers, account/client teams, and clients.

## Strategic differentiation

ScopeDelta must not compete primarily on generic boards, issue tracking, chat-style AI, or being open source. Those are category requirements or distribution advantages.

The differentiating system is a **Commercial Delivery Graph** that links:

- client and engagement;
- signed scope/baseline versions;
- requirements and acceptance criteria;
- client requests and clarifications;
- commercial decisions and approved changes;
- delivery work items and milestones;
- code/change evidence through repository integrations;
- QA/test evidence and defects;
- client approvals/acceptance;
- schedule/effort/commercial impact;
- audit history.

A delivery work item should be traceable to an approved baseline, an approved change, or an explicit internal commercial decision. Missing links represent commercial drift.

## Daily-use product principle

The commercial graph is the wedge, but ScopeDelta must also be a credible daily work system. A team should not have to pay for ScopeDelta while still maintaining a second PM system merely to manage ordinary software delivery.

The product will therefore build its own opinionated project/work-item core rather than permanently depending on Jira or Linear.

## Build-vs-integrate boundary

Build natively where the workflow is central to client software delivery:

- clients and engagements;
- projects, milestones, cycles/sprints and work items;
- requirements, dependencies, status and assignment;
- comments, decisions, lightweight project knowledge;
- client-facing requests/status/approvals;
- commercial baseline/change control;
- QA/acceptance state;
- project health and AI-assisted delivery operations.

Integrate rather than rebuild initially where mature infrastructure already exists and does not create differentiation:

- Git repository hosting;
- source-control protocols;
- CI/CD runners;
- cloud infrastructure management;
- accounting/payment rails;
- synchronous video/chat infrastructure.

GitHub/GitLab and similar systems should connect to ScopeDelta; ScopeDelta should not attempt to become a source-code hosting provider in the early product layers.

## Open/free distribution strategy

The intended distribution model is open-core/self-host plus managed cloud.

### Community / self-hosted

The community edition should be genuinely useful, not a demo. It should eventually include the core delivery model, projects/work items, APIs/webhooks, and enough commercial-control capability to demonstrate the differentiated workflow. It should support BYO/local AI where practical.

### Managed cloud

The hosted product sells convenience and operational value: zero-maintenance hosting, upgrades, backups, managed AI/inference, email/notifications, collaboration, observability, and higher operational limits.

### Business / enterprise capability

Advanced governance, SSO/directory integration, policy controls, audit/export, data-residency options, advanced portfolio controls, and support may be paid capabilities when required by larger customers.

Exact open-source license is deliberately deferred to a separate founder/legal decision before public source release. Exact plan prices/limits also remain a founder decision.

## Pricing principle

Avoid making seat count the only economic unit. Per-seat pricing becomes expensive for 50–500-person delivery organizations and penalizes broad adoption.

Working pricing hypothesis for later validation:

- self-hosted community: free;
- hosted entry tier: low-friction/free or very low cost with bounded usage;
- paid cloud: price primarily around active client delivery capacity and managed/AI usage, with generous internal collaboration;
- enterprise: governance/support requirements.

This is a product-economics principle, not approved final pricing.

## Product quality principles

- **Innovation:** automate handoffs and decisions that existing PM tools merely record.
- **Tech-first:** architecture, APIs, events and AI are first-class product capabilities rather than afterthoughts.
- **Simple by default:** opinionated workflows and excellent defaults; complexity should appear only when needed.
- **Reliable:** durable state, idempotency, auditability, recoverable async work, explicit failure states and production security.
- **AI-native:** AI can reason over the delivery graph and take bounded actions; it is not merely a chatbot panel.
- **Human authority:** commercial commitments, client-visible decisions and destructive actions remain controlled by authorized humans/policies.
- **Global:** multi-currency and international-ready data model from the start.
- **Portable:** self-host and managed cloud should share the same core product model; avoid unnecessary provider lock-in.

## Layer research discipline

Before a major product layer moves to `READY FOR CODEX`, the CEO/product role must perform a focused research review for that layer:

1. identify the daily user pain and role affected;
2. identify best-in-class incumbent behavior that is table stakes;
3. identify incumbent complexity or failure modes ScopeDelta should avoid;
4. define the ScopeDelta-specific differentiator/USP for the layer;
5. define measurable acceptance outcomes and explicit non-goals.

This prevents the broader ambition from becoming an unresearched feature backlog.

## Consequences

- The older narrow scope-change roadmap is superseded.
- The product will be built in layers so each layer is useful and testable before the next one.
- SC-004 remains the first engineering dependency, but its platform/domain boundaries must support the wider delivery OS.
- Downstream issues must be rewritten around the layered delivery model and Commercial Delivery Graph.
- We will not try to clone every Jira/Linear/Atlassian feature before shipping the differentiating workflow.

## References

- `docs/research/MARKET_PROBLEM_THESIS_2026-08.md`
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/decisions/ADR-004-self-serve-production-saas.md`
- RS-001
