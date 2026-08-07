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
- currently coordinate delivery across Jira/Linear/ClickUp/other PM tools plus documents, chat, email and repositories;
- need clients to see and approve the right information without exposing internal delivery noise;
- suffer from requirements, status, scope, QA and commercial decisions becoming disconnected across systems.

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

The differentiating system is the **Commercial Delivery Graph**.

It links:

- client/engagement;
- signed scope and baseline versions;
- requirements and acceptance criteria;
- client requests/clarifications;
- commercial decisions and approved changes;
- project milestones, cycles and work items;
- repository/PR/CI evidence from integrations;
- QA/test/defect evidence;
- client approval/acceptance;
- effort, schedule and commercial impact;
- audit history.

Every material delivery item should eventually be explainable by an approved baseline, an approved change, or an explicit authorized decision to absorb/swap/defer/reject the work. Missing relationships are commercial drift.

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

### Layer 1 — Delivery Core

The minimum product capable of replacing basic Jira/Linear-style day-to-day project tracking for the target ICP:

- clients and engagements;
- projects;
- milestones/releases;
- cycles/sprints where used;
- work items, subtasks, dependencies and acceptance criteria;
- assignments, priority, estimates and statuses;
- list/board views, filtering and search;
- comments, decisions and activity history;
- lightweight project knowledge/specification pages;
- notifications and actionable personal/project views;
- clean internal project workflows with excellent defaults.

Layer 1 should be opinionated and fast rather than exposing Jira-scale configuration complexity immediately.

### Layer 2 — Commercial Delivery Graph

ScopeDelta's primary wedge:

- versioned proposal/SOW/scope baseline;
- evidence-backed requirements, deliverables, exclusions, assumptions and revision limits;
- client request/change capture;
- commercial decision taxonomy: included, defect/fix, revision allowance, absorb, swap, defer, paid change, clarify, reject;
- links between commercial decisions and delivery work;
- commercially unlinked work/drift detection;
- warning-by-default with optional policy gates later;
- schedule/effort/commercial impact with evidence separated from estimates.

### Layer 3 — Client Collaboration & Negotiation

A client-safe experience built into the same project rather than exposing the internal board directly:

- client request/clarification channel;
- client-facing project status and milestones;
- scope/change negotiation packets;
- secure approve/reject/request-clarification flows;
- deliverable/milestone acceptance;
- immutable decision versions and audit history;
- client-safe terminology separated from internal technical detail.

### Layer 4 — Engineering & QA Delivery Loop

Connect delivery planning with engineering evidence without rebuilding source-control infrastructure:

- GitHub/GitLab repository integration;
- link work items to branches, commits, pull/merge requests and CI state;
- development/review/release readiness;
- bugs/defects and test evidence;
- acceptance criteria and QA status;
- environments/releases where useful;
- trace requested → planned → implemented → tested → accepted.

ScopeDelta does not initially host Git repositories or build its own CI/CD runner platform.

### Layer 5 — AI-Native Delivery Intelligence

AI is a system layer, not a decorative chatbot:

- turn messy requests/specs into structured work with traceability;
- scope/commercial comparison with citations and uncertainty;
- PM assistance for backlog hygiene, dependency/risk detection and replanning;
- developer context summaries and requirement/acceptance retrieval;
- QA assistance for test scenarios, regression/risk and requirement coverage;
- client-safe status/change explanations;
- project health and drift detection;
- bounded agent actions with permission, audit and cost controls;
- managed AI plus BYO/local-model paths where practical.

### Layer 6 — Portfolio, Operations & Enterprise Scale

For larger organizations after the core workflow is strong:

- multi-project/portfolio views;
- capacity and workload;
- project budget/margin visibility where supported by data;
- reusable templates and organization standards;
- advanced workflow/policy controls;
- advanced RBAC;
- SSO/SCIM and governance when justified;
- audit/export, retention/data-residency capabilities;
- enterprise administration and support features.

## Role-specific product value

### Project / delivery manager

Less manual translation, backlog cleanup, status reporting, chasing approvals and reconstructing why work exists.

### Account / commercial owner

Clear relationship between agreement, requested changes, approved decisions, delivery impact and client acceptance.

### Developer

Clean actionable work with current context, requirements, dependencies and acceptance criteria without reading long client threads or contracts.

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

Low price must come from efficient architecture, open-source components, self-service operations and automation—not from accepting unreliable behavior or weak security.

### Open/free-first distribution

Prefer open-source dependencies, open standards and self-hostable infrastructure. The intended distribution model is a genuinely useful community/self-hosted edition plus managed cloud.

Where practical, self-hosted customers should be able to bring their own AI provider or local model. Managed cloud can bundle AI and operational services.

Exact public-source license is a later founder/legal decision.

### Global architecture

Core domain models must support global customers, currencies, time zones and regional deployment needs without country-specific assumptions.

### Human authority

AI may recommend and take bounded operational actions, but binding commercial commitments, client-visible approvals and destructive actions remain governed by authorized users/policies.

## Commercial model direction

The intended model is:

- useful self-hosted/community edition at no software license cost;
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

## Production release principle

A landing page or isolated AI demo is not a product release.

Each capability layer must be production-quality before it becomes a dependency of the next layer. General availability requires a coherent self-service workflow with tested tenant isolation, recoverability, observability, cost controls and no routine founder intervention.

## Durable decisions

See:

- `docs/decisions/ADR-004-self-serve-production-saas.md`
- `docs/decisions/ADR-005-ai-native-client-delivery-os.md`
- `docs/research/MARKET_PROBLEM_THESIS_2026-08.md`
