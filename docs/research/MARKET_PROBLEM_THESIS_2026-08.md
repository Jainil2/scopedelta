# ScopeDelta Market Problem & USP Research Thesis — August 2026

## Status

Accepted product-research direction after founder strategy review on 2026-08-07. Continue market monitoring as each product layer is specified.

## Executive finding

The market validates two things simultaneously:

1. software delivery organizations have persistent problems with project complexity, client visibility, requirements drift, scope/change control, coordination and margin leakage;
2. no single generic feature such as AI issue creation, open-source project management, SOW comparison, client portals or change-order generation is unique in 2026.

Therefore ScopeDelta should not be built as a narrow AI scope checker or as a generic Jira clone.

The opportunity is an **AI-native client software delivery operating system** whose daily project-management core is useful enough to replace basic Jira/Linear usage for service teams, while its durable differentiation is a **Commercial Delivery Graph** connecting client intent to delivery execution and acceptance.

## Target customer

Primary ICP: software agencies, consultancies, outsourcing/product-engineering firms and similar B2B software-delivery organizations with roughly 50–500 employees.

Why this segment:

- enough projects/users for coordination failures to become expensive;
- commercial/client and delivery authority are separated across roles;
- repeated client requests and status translation create PM overhead;
- project margin and utilization matter;
- they can support meaningful recurring software spend;
- they are large enough to need governance but often small enough to feel pain from heavyweight enterprise tooling.

## Evidence: incumbent strengths and gaps

### Jira

Jira is not technologically stagnant. Current Jira includes boards/lists/timelines/calendars, forms, dependencies, automation, reporting, goals, Rovo AI, agent actions, AI-assisted work creation and more than 3,000 marketplace integrations.

Implication: ScopeDelta cannot win by claiming "Jira has no AI" or by offering basic boards/workflows.

Its opportunity is a more opinionated client-delivery model with less configuration burden and a native commercial/client boundary.

### Linear

Linear is fast, opinionated and increasingly AI-native. Linear Agent can create/update issues, projects, milestones and initiatives, summarize ongoing work and reason over workspace context. Linear also has Customer Requests linked to issues/projects.

However public agency discussions repeatedly show friction when using Linear for external client delivery: teams use workaround structures, separate portals/status reports, or third-party tools because clients should not receive broad internal workspace access and technical tickets often require translation.

Implication: "fast and modern" is not enough. ScopeDelta should combine that usability level with client-service semantics that Linear does not center.

### Plane

Plane is an especially important competitive warning. Its Community Edition is AGPL-licensed and self-hostable with unlimited projects/work items/users; it is AI-native and offers inexpensive managed plans. Business capabilities include external intake and customer records.

Implication: **open source + self-host + low price + AI project management is not a USP.** It is a strong distribution/product principle, but ScopeDelta still needs differentiated workflow value.

### OpenProject

OpenProject proves that mature open-source project-management software can cover classic/agile/hybrid planning, boards, work breakdown, scheduling, workload and integrations with GitHub/GitLab while monetizing hosted/enterprise support.

Implication: open-core/self-host can support a sustainable business model, but ScopeDelta must be more specialized and AI-native rather than competing solely on licensing.

### GitLab

GitLab demonstrates how deeply planning can integrate with engineering artifacts through issues, boards, epics and repository/CI context.

Implication: implementation evidence is valuable to our graph, but building source hosting/CI would put ScopeDelta into an enormous infrastructure market with little initial differentiation. Integrate rather than rebuild this layer.

## Real recurring problems worth solving

### 1. Translation loss between client and delivery team

Client requests arrive in business language. PMs manually convert them into engineering work. Context, constraints and commercial meaning are often lost.

### 2. Client visibility without exposing internal complexity

Agencies often do not want to expose internal Jira/Linear boards directly. Developer-oriented work item descriptions are also poor client status communication. Teams therefore duplicate status updates and use extra portals/reports.

### 3. Commercial drift

A request can become a task and then active work before anyone verifies whether it belongs to the original agreement or an approved change.

### 4. Requirements drift and stale execution context

The SOW, client discussions, current backlog, code and test state may all describe different versions of reality.

### 5. PM coordination tax

Project managers spend significant time creating/cleaning tickets, updating status, chasing clarification, preparing reports, identifying blockers, coordinating QA and maintaining alignment across tools.

### 6. Delivery evidence is fragmented

Requirements, work items, pull requests, CI results, defects, test evidence and client acceptance live in separate systems. When a project goes wrong, reconstructing what was requested, implemented, verified and accepted is expensive.

## Accepted product thesis

### Category

> **ScopeDelta is an AI-native client software delivery operating system.**

### Wedge

> **ScopeDelta prevents unapproved or misunderstood client scope from silently becoming delivery work.**

### USP

> **ScopeDelta keeps client intent, commercial authorization and actual software delivery connected in one graph — from signed requirement to work item, code/QA evidence and client acceptance — while AI continuously reduces the coordination work required to keep them aligned.**

This is more defensible than "AI says whether a request is in scope."

## The Commercial Delivery Graph

Core relationship chain:

client/engagement → commercial baseline → requirement → client request/clarification → commercial decision → delivery work → implementation evidence → QA evidence → client acceptance

Important properties:

- versioned evidence, not mutable blobs;
- tenant isolation;
- explicit internal/client visibility boundaries;
- immutable/shared decision versions where appropriate;
- clear difference between evidence-backed facts, estimates and AI suggestions;
- every material delivery item can explain why it exists;
- missing commercial/requirement links create actionable drift signals.

## Commercial decision taxonomy

ScopeDelta should not treat every scope difference as an upsell.

Initial taxonomy:

- included in baseline;
- defect/fix obligation;
- allowed revision;
- absorbed by provider;
- swap/reprioritize existing scope;
- defer to future phase;
- paid change;
- clarification required;
- reject/do not perform.

This better matches real delivery behavior and preserves client trust.

## AI-first product behavior

AI should operate on graph state and workflow context rather than exist as an isolated chat box.

High-value AI jobs include:

- convert messy business requests into structured requirements/work;
- detect missing acceptance criteria and ambiguity before development;
- compare client requests to baseline/current commitments;
- identify commercial drift and stale requirements;
- summarize project state differently for PM/developer/QA/client audiences;
- surface risks/dependencies from current execution evidence;
- propose test coverage from requirements/changes;
- identify work that lacks requirement, commercial or QA traceability;
- take bounded project-management actions only with permissions/audit/cost controls.

## Open/free strategy

Accepted direction:

- prefer open-source infrastructure and open standards;
- maintain a useful self-hosted/community path;
- support BYO/local AI where technically practical;
- sell managed cloud convenience, managed AI, reliability and higher operational capability;
- keep quality/security equivalent in the shared core rather than making free synonymous with unreliable;
- final product license and commercial feature boundary require a separate legal/business decision before public source release.

The market already has strong open-source PM competitors, so free/open is a distribution advantage rather than the sole product differentiation.

## Pricing direction

Founder direction is low-cost/high-volume with premium B2B quality.

Competitive context: current public plans commonly use per-seat pricing (for example Jira Standard, Linear Basic/Business and Plane Pro/Business). For a 50–500-person organization, seat taxes become material and can discourage broad participation.

Working ScopeDelta hypothesis:

- free self-hosted community edition;
- low-friction hosted entry tier;
- paid managed cloud priced primarily around active client-delivery capacity and managed AI/usage rather than only seats;
- generous/free client participants/viewers;
- enterprise governance/support as a higher-value tier.

Exact prices/limits remain unapproved until unit economics and billing-provider constraints are known.

## What is table stakes versus differentiation

### Table stakes

- projects/work items;
- assignment/status/priority;
- milestones/cycles;
- basic dependency/estimate support;
- boards/lists/search/filters;
- comments/activity;
- docs/specs;
- notifications;
- secure tenancy;
- Git/repository links/integration;
- reasonable APIs/webhooks.

These must be excellent but implemented without unnecessary complexity.

### Differentiators

- first-class client/internal dual-view model;
- Commercial Delivery Graph;
- scope/request/work/QA/acceptance traceability;
- commercial-drift detection;
- client negotiation and acceptance inside the delivery lifecycle;
- AI reasoning/actions over the complete delivery graph;
- role-specific context for PM/developer/QA/client;
- open/self-host + managed cloud without creating two separate products;
- disruptive economics that do not punish broad team/client participation.

## What not to build initially

Even under the larger ambition, ScopeDelta should not initially rebuild:

- Git repository hosting;
- CI/CD runner infrastructure;
- a Slack/Teams replacement;
- video conferencing;
- full accounting/payments infrastructure;
- generic CRM/marketing automation;
- every Jira workflow/configuration primitive;
- every industry-specific project-management use case.

The target is an end-to-end **client software delivery** system, not an all-purpose enterprise suite on day one.

## Roadmap implication

Build in product layers:

0. platform kernel;
1. delivery core;
2. Commercial Delivery Graph;
3. client collaboration/negotiation;
4. engineering + QA loop;
5. AI-native delivery intelligence;
6. subscription/cloud economics/distribution;
7. portfolio/operations/self-service scale;
8. enterprise/GA hardening.

See `docs/ROADMAP.md` and `docs/decisions/ADR-005-ai-native-client-delivery-os.md`.

## Research discipline going forward

Before each major layer moves to `READY FOR CODEX`, perform a focused competitor/problem review for that layer and explicitly identify:

- user pain;
- incumbent best-in-class behavior we must match;
- incumbent complexity we should avoid;
- ScopeDelta differentiation;
- non-goals;
- measurable product outcome.

Research is therefore continuous and tied to engineering sequencing, not a one-time market document.
