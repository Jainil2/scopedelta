# ScopeDelta Production Roadmap

This roadmap targets a complete self-serve subscription SaaS, not a concierge pilot or proof of concept. The product remains narrowly focused on scope-change management while the implementation is production-grade.

## Completed foundation

Already complete:

- deployable Next.js application foundation;
- CI, tests, lint/typecheck/build gates;
- public landing page and paid-interest form;
- production Netlify deployment and basic operations runbook.

These are infrastructure/marketing foundations only. They are not the core product.

## Phase 1 — Identity, tenancy, persistence, and authorization

### Outcome
A customer can create an account/workspace and the application can safely persist tenant-owned data.

### Product scope
- authentication and account lifecycle;
- organization/workspace creation;
- production data store selected by engineering;
- tenant membership/ownership model;
- strict authorization boundaries;
- foundational audit timestamps and identifiers;
- minimum client/project persistence needed by later phases.

### Exit criteria
A test suite proves one tenant cannot read or mutate another tenant's data, and a real user can create/sign in to a workspace and persist a project.

## Phase 2 — Project scope ingestion and evidence model

### Outcome
A paying customer can give ScopeDelta the source of truth for an active project.

### Product scope
- create/manage clients and projects;
- paste scope text and upload supported scope/SOW documents;
- secure document storage and metadata;
- structured scope items: deliverables, exclusions, constraints, assumptions, revision/change limits where present;
- trace structured items back to source evidence;
- ingestion/extraction status, errors, retry, and editing.

### Exit criteria
A customer can add a real project scope and inspect/edit structured scope items with source traceability.

## Phase 3 — Core change-request analysis engine

### Outcome
ScopeDelta solves the central business problem: compare a new request against the agreed scope and produce a useful, defensible decision draft.

### Product scope
- submit/manage client change requests;
- AI-assisted comparison against project scope;
- classification: in scope / out of scope / partially in scope / insufficient information;
- cited supporting scope evidence;
- affected deliverables, assumptions, clarification questions, and relevant impact;
- human review/edit before commercial action;
- asynchronous processing/retry/idempotency where needed;
- usage metering, limits, cost controls, and abuse protection for variable-cost operations.

### Exit criteria
A customer can go from stored scope + new request to a reviewed scope decision without founder/concierge processing.

## Phase 4 — Change order and client approval

### Outcome
The scope decision becomes commercially actionable without leaving the product.

### Product scope
- generate/edit client-facing change order;
- capture commercial fields such as added deliverables, price/fee, timeline impact, assumptions, and validity where applicable;
- secure public client approval link;
- approve / reject / request clarification workflow;
- tamper-resistant identifiers and appropriate access controls;
- approval/change audit history;
- notifications needed for the workflow;
- dashboard status for pending/approved/rejected changes.

### Exit criteria
One complete production workflow can move from project scope to client approval without manual founder operations.

## Phase 5 — Subscription billing and automatic entitlements

### Outcome
Customers fund their own ongoing usage through recurring subscription revenue.

### Product scope
- recurring subscription checkout for the approved launch market/provider;
- webhook-driven subscription state;
- automatic product entitlements based on subscription state;
- centrally configurable plan/usage allowances;
- failed-payment/grace/cancellation behavior;
- self-service billing/account management where provider capability permits;
- usage enforcement before expensive operations exceed plan economics;
- test/sandbox coverage before live activation.

### Founder gate
Exact public price, plan structure, and live payment-provider activation require founder approval. Engineering must not hard-code final pricing into core business logic.

### Exit criteria
A customer can subscribe, gain access automatically, use the product within plan limits, and cancel/manage the subscription without manual founder entitlement changes.

## Phase 6 — Self-service onboarding, operations, and production hardening

### Outcome
The product can serve growing customer volume with minimal founder attention.

### Product scope
- first-run onboarding/checklist inside the product;
- actionable error states and retry/recovery paths;
- in-product help/documentation for core workflows;
- account/data deletion and retention behavior;
- rate limits and abuse controls;
- observability for failures, latency, AI usage/cost, email/workflow delivery, and billing events without unnecessary customer-content logging;
- backup/recovery expectations for persistent data;
- production security review of tenant isolation, public approval links, file handling, secrets, and webhook endpoints;
- end-to-end automated tests for revenue-critical workflows;
- operational runbooks for exceptional incidents.

### Exit criteria
Routine customer onboarding, usage, payment, and recovery do not depend on a founder call or manual backend changes.

## General-availability release gate

ScopeDelta is ready for paying self-serve customers only when all of the following work together in production:

1. sign up / sign in;
2. workspace and tenant isolation;
3. subscription entitlement;
4. client/project creation;
5. scope/SOW ingestion;
6. structured scope with citations;
7. new change request;
8. AI-assisted cited analysis;
9. human review/edit;
10. change-order generation;
11. secure client approval/rejection/clarification;
12. audit/history/dashboard;
13. usage limits/cost controls;
14. account/billing lifecycle;
15. monitoring, recoverability, and security checks.

A landing page, demo, synthetic workflow, or concierge process does not satisfy this release gate.

## Engineering sequencing

GitHub issues define the executable backlog. Only the highest-priority unblocked issue should be marked `READY FOR CODEX`; downstream issues should remain blocked until dependencies are merged.

## Product discipline

Production-grade does not mean building every enterprise feature. Prioritize the narrow scope-change workflow, tenant/data safety, commercial automation, cost control, and operational scalability. Defer unrelated PM/CRM/accounting/integration features until paying-customer evidence demonstrates a need.
