# ScopeDelta Product Definition

## Mission

Help small software agencies and freelancers prevent unbilled scope creep by converting ambiguous client requests into reviewable, client-approved change orders.

## Initial ICP

Small software agencies and experienced freelancers that:

- deliver fixed-price or milestone-based software projects;
- work from proposals, statements of work, or agreed requirement lists;
- receive ongoing client requests through email, chat, meetings, or documents;
- lose time or margin deciding whether requests are inside the agreed scope;
- need a professional way to price and approve additional work.

Initial buyer: agency founder, delivery/project manager, technical lead, or senior freelancer.

## Core problem

After a project begins, clients request additions or modifications. Teams often perform small additions without formally comparing them with the agreed scope, quantifying impact, or obtaining commercial approval. This creates margin leakage and client disputes.

The product must solve this operationally, not merely describe the problem. ScopeDelta must hold the agreed scope, compare new requests against it with evidence, support a human commercial review, create a change order, and preserve the client decision.

## Product promise

> Turn a new client request into a reviewable, billable change order in minutes while keeping the agency in control of the commercial decision.

## Required self-serve workflow

A normal customer must be able to complete the product lifecycle without founder assistance:

1. Create an account and workspace.
2. Activate a subscription/entitlement for production use.
3. Create a client and project.
4. Upload or paste the agreed project scope/SOW.
5. ScopeDelta securely stores the source and structures relevant deliverables, exclusions, constraints, assumptions, and other scope items with source traceability.
6. The user submits a new client request.
7. ScopeDelta compares the request with the agreed scope and proposes a classification:
   - in scope;
   - out of scope;
   - partially in scope;
   - insufficient information.
8. ScopeDelta explains the reasoning, cites affected scope items/source evidence, identifies assumptions/clarifications, and estimates relevant delivery impact where the available information supports it.
9. The agency reviews and edits the analysis and commercial impact before anything is sent to a client.
10. ScopeDelta generates a professional client-facing change order.
11. The agency shares a secure client approval link.
12. The client can approve, reject, or request clarification.
13. ScopeDelta preserves the approval/change history and exposes the current commercial state in the agency dashboard.
14. The customer manages subscription and account lifecycle without founder intervention.

## Founder operating constraint

ScopeDelta is operated by a solo founder. The standard product must therefore not depend on:

- sales or onboarding calls;
- concierge/manual scope processing;
- manual account provisioning;
- manual payment confirmation;
- manual entitlement changes;
- routine customer-support conversations;
- founder intervention for normal retries, failures, or account recovery.

Founder involvement should be exception-only for material commercial decisions, legal/compliance matters, production incidents, abuse, or unusual account problems.

## Critical product principles

### Human-controlled commercial decisions

AI assists analysis; it does not autonomously make contractual or commercial commitments. The agency user must be able to review and edit conclusions before a client sees them.

### Evidence over unsupported AI conclusions

Every scope classification must trace back to the agreed scope. The product should prefer explicit citations/source references and identify uncertainty instead of presenting unsupported certainty.

### Multi-tenant isolation

Every customer-owned project, scope document, request, analysis, change order, approval, usage record, and subscription entitlement must be isolated to the correct tenant at every read/write boundary.

### Economically bounded automation

AI, storage, email, background processing, and other variable-cost operations must be metered and governed by subscription entitlements, plan limits, rate limits, and abuse controls so growth does not create unbounded founder-funded infrastructure cost.

### Low-operations architecture

Prefer managed, scalable, reversible infrastructure and automatic recovery/monitoring over systems that require regular founder administration.

## Production launch success criteria

The product is not considered launch-ready merely because a landing page or demo works. General availability requires an end-to-end self-serve workflow in production.

At minimum:

- a new customer can sign up without manual provisioning;
- tenant isolation is enforced and tested;
- a customer can activate a recurring subscription in the supported launch market(s);
- plan state automatically controls product entitlement;
- a customer can create a project and provide an agreed scope/SOW;
- the system can structure the scope with traceable evidence;
- a customer can submit a new request and receive a cited scope-impact analysis;
- the customer can review/edit the result;
- the customer can generate and send a change order;
- the client can approve/reject/request clarification through a secure public flow;
- approval history/audit state is preserved;
- usage/cost-generating operations are metered and bounded;
- user-facing failures are recoverable without founder intervention where practical;
- monitoring, security, data-retention/deletion, backup/recovery expectations, and operational runbooks are adequate for paying customers;
- the standard customer lifecycle can be completed without calls or concierge work.

## “Enterprise-grade” boundary

The initial product should use production-grade security, reliability, auditability, scalability, and operational practices.

Do not confuse that with enterprise procurement scope. Unless customer evidence later requires them, the initial release does not need:

- SAML/SSO or SCIM;
- on-premise deployment;
- complex enterprise RBAC;
- custom SLAs;
- bespoke procurement workflows;
- a broad integration marketplace.

## Initial product non-goals

Do not add these merely because they appear useful:

- full project management;
- team chat;
- time tracking;
- CRM;
- accounting/invoicing platform;
- native iOS/Android applications;
- automatic Gmail/Slack/WhatsApp ingestion;
- simultaneous Jira/Linear/Slack/Notion integrations;
- autonomous pricing commitments;
- elaborate agent frameworks or speculative microservices.

## Commercial model

The normal business model is recurring subscription SaaS. Subscription revenue should fund the ongoing variable infrastructure required to serve customers.

Exact public subscription pricing and live payment-provider activation require founder approval before general availability. Pricing and usage allowances must be designed so expected cloud/AI/email/storage costs remain economically sustainable.

## Durable decision

See `docs/decisions/ADR-004-self-serve-production-saas.md` for the founder decision that supersedes the concierge-first operating model.