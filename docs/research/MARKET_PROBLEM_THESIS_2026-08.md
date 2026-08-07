# ScopeDelta Market Problem & USP Research Thesis — August 2026

## Status

Working CEO research thesis. Engineering execution beyond basic reversible foundation work should follow the differentiated problem defined here, not the older generic "AI scope creep detector" concept.

## Executive finding

Scope creep is a real and recurring commercial problem for client-service businesses, especially fixed-price and milestone software delivery. However, the simple product pattern "upload SOW + paste client request + AI says in/out of scope + generate a change order" is already crowded in 2026.

The stronger opportunity is not another standalone scope checker. It is a **commercial control plane between agreement and delivery** that continuously reconciles what was sold, what the client is asking for, and what the team is actually preparing to execute.

### Working product thesis

> ScopeDelta prevents unapproved scope from silently becoming work.

A stronger one-line category definition:

> **ScopeDelta is the commercial control plane for client delivery: it continuously reconciles the signed scope, incoming requests, and delivery work so every task is either covered by the agreement or backed by an explicit commercial decision.**

This is a materially different product from a one-off scope classifier or change-order generator.

## Evidence that the problem is real

### 1. Margin sensitivity makes small leaks important

Promethean Research's 2026 digital-agency research reports an average 2025 net margin of about 13% for digital agencies, with pricing pressure increasing as clients expect AI-related efficiency. At margins like these, a few percentage points of unbilled work matter materially.

Teamwork's July 2026 scope-creep guidance describes agency projects going financially wrong through small, undocumented additions rather than bad initial estimates. Their example: if 10 projects each absorb only 5% more unbilled work, the agency has effectively given away half a project's revenue.

### 2. The problem occurs at the moment of request, not at month-end reporting

Repeated practitioner discussions show the same operational pattern:

- a client asks for a "small" change in Slack/email/call;
- a delivery person wants to preserve the relationship and says yes;
- nobody has time to re-read the SOW and assess impact immediately;
- the request becomes a task or gets discussed/started;
- the commercial process catches up later, if at all;
- profitability reports reveal the damage after leverage has been lost.

High-engagement examples include web-development discussions where teams describe approved requirements being changed after development starts, and where formal change requests only happen after a buffer is exhausted.

A July/August 2026 project-management discussion identifies the missing chain as **scope → delivery → acceptance → payment**. Jira is useful delivery evidence, but by itself it does not settle what was commercially authorized.

### 3. Existing PS/agency systems acknowledge the gap

Established products already market project profitability, budget warnings, change-request tracking, and sign-off because this is a genuine operational problem:

- Teamwork tracks project profitability and explicitly recommends a formal change-request process.
- Productive focuses on real-time budget/profitability monitoring and budget-overrun alerts.
- Scoro added a Change Request Log in 2026 to capture impact, sign-off and links to projects.
- Accelo describes uncontrolled scope change as a profitability threat requiring structured change control.
- Kantata notes that scope changes that never make it into the system create revenue leakage between delivery and billing.

These products validate the need, but much of their control is manual and/or downstream of the initial request.

## Competitive landscape

### A. Pre-sales / CPQ / PSA

#### ScopeStack

Strong capabilities:

- detailed service scoping, effort, pricing, margin and SOW generation;
- approvals and project versions;
- integrations with PSA/CRM/project systems;
- approved scopes can become delivery tasks;
- marketing now explicitly discusses change-request tracking and proper billing approval in Asana/Teamwork workflows.

Implication: our older claim that "ScopeStack is only pre-sales while ScopeDelta is post-contract" is no longer sufficiently accurate or differentiated.

ScopeStack is also a comparatively heavyweight, sales-assisted CPQ/PSA product. Current public pricing is credit-based, with a 250-credit minimum order and optional paid onboarding/integration services. This leaves room for a much simpler self-serve product, but simplicity alone is not a durable USP.

#### Teamwork / Productive / Scoro / Accelo / Kantata

These products are broad operational systems. Their strengths are budgets, time, utilization, tasks, financial visibility and change logs. Their weakness for our target workflow is that they generally depend on a human recognizing a request as commercially significant and recording it correctly.

They are excellent systems of record **after work becomes work**. ScopeDelta should own the decision boundary **before unapproved work enters delivery**.

### B. New scope-creep-specific products

The 2026 market contains many narrow tools with overlapping promises, including Fenscope, Ersilia, Sentra, ScopeGuard, ScopeStamp, ScopeFrame, ScopeKit, ScopeDue, Dairakar, MarginRail, Boundix, Clovert, ScopeOrNope and several early-stage/waitlist products.

Common feature set across this group:

- store/upload contract or scope;
- paste/log a client request;
- classify as in/out of scope;
- cite a clause in some products;
- generate a response/change order;
- send a public approval link;
- track recovered revenue;
- some monitor communication channels such as email, Slack or WhatsApp.

Conclusion: **contract upload + AI classification + change-order generation is category parity, not innovation.** Even automatic monitoring of client messages is emerging in multiple products.

## The unmet operational problem

The strongest white space found in this research is **closed-loop commercial reconciliation**.

Most products reason about one of these layers:

1. the agreement/SOW;
2. the client's request;
3. project tasks/work;
4. delivery evidence;
5. approval/payment.

The real failure occurs because these layers drift apart.

A client request can be discussed and converted into Jira/Linear tasks before anybody verifies that the task maps to the signed scope or an approved change. Profitability software notices later. Change-order tools help only if somebody manually invokes them. Communication-monitoring tools can flag messages, but do not necessarily prove that execution stayed aligned afterwards.

## Proposed innovation: the ScopeDelta Commercial Graph

ScopeDelta should model the customer engagement as a traceable graph rather than a stack of documents.

### Core entities

- signed scope / baseline versions;
- atomic scope commitments and exclusions with source evidence;
- client requests and their originating evidence/channel;
- commercial decisions;
- approved change versions;
- delivery work items (for example Jira/Linear issue, milestone, or later GitHub evidence);
- client acceptance decisions;
- monetary/timeline impact.

### Required relationship

Every delivery work item should be explainable by one of:

- an original approved scope item;
- an approved change;
- an explicitly recorded agency decision to absorb/swap/defer the work.

Anything else is **commercially unlinked work** and should be surfaced as drift.

## Proposed USP

### USP statement

> **ScopeDelta catches the gap between what the client asked for, what the contract allows, and what the team is about to build — before unapproved work consumes margin.**

### Product behavior that makes the USP real

1. **Versioned commercial baseline**
   - ingest SOW/proposal/approved scope;
   - create evidence-backed atomic commitments, exclusions, revision limits and assumptions;
   - preserve versions and source traceability.

2. **Continuous request capture**
   - start with one high-value integration/channel rather than every integration;
   - capture requests without making the PM copy/paste everything manually;
   - manual input remains available as fallback.

3. **Commercial decision engine**
   - classify request against the baseline with citations;
   - distinguish new scope from clarification, defect/fix, revision allowance, dependency/client responsibility and insufficient evidence;
   - expose uncertainty instead of fake certainty.

4. **Decision options, not only "charge extra"**
   - included / absorb from buffer;
   - swap for existing scope;
   - defer to later phase;
   - paid change;
   - request clarification;
   - reject.

   This matches real agency behavior better than forcing every delta into a change order.

5. **Delivery gate / drift detection**
   - link approved scope/change items to delivery work;
   - flag work items that have no approved commercial parent;
   - warn before the work is marked ready/in progress where integration capabilities permit;
   - never silently block a customer's project without an explicit configured policy.

6. **Impact graph**
   - use existing project work/dependencies/estimates where available to show what the change affects;
   - separate evidence-backed facts from AI estimates;
   - show timeline/resource/testing/dependency consequences.

7. **Closed-loop reconciliation**
   - at milestone/project level show: sold → changed → approved → delivered → accepted;
   - expose commercially unlinked work and pending decisions;
   - provide defensible history without reconstructing Slack, Jira and old PDFs manually.

## Recommended initial ICP

### Primary

Software development agencies / consultancies roughly 5–50 people that:

- deliver fixed-price or milestone projects;
- run multiple concurrent client engagements;
- use a PM/delivery system such as Jira, Linear, Teamwork or similar;
- receive client requests through email/Slack/meetings;
- have PM/account/delivery people who can accidentally authorize work socially before commercial review;
- care materially about project margin.

### Why not lead with solo freelancers

Freelancers clearly experience the pain, but the current market is crowded with inexpensive freelancer-focused change-order tools. The highest-value differentiated problem appears when **commercial authority and delivery execution are split across people and systems**. That makes small agencies/consultancies a stronger initial wedge and supports higher recurring willingness to pay.

Solo users may still be supported later through a lighter plan.

## Backlog implications

### SC-004 — identity, tenancy, persistence

Keep. This is enabling infrastructure and remains necessary under almost any B2B SaaS direction.

However, it should stay blocked until this research checkpoint is accepted so we do not accidentally encode the wrong product model into client/project entities.

### SC-005 — scope ingestion

Needs revision before execution.

Change from generic "document ingestion" toward **versioned commercial baseline ingestion**. The model must preserve atomic scope commitments/exclusions/revision limits/assumptions and citations. It should be designed for later linking to requests and delivery work.

### SC-006 — analysis engine

Needs major revision.

A one-off pasted request classifier is insufficient. Reframe as the **commercial decision engine** and ScopeDelta Commercial Graph. The classification taxonomy should cover clarification/defect/revision allowance and commercial options, not only in/out/partial/insufficient.

### New P0 capability required — request/work integration

Add a dedicated issue for the first continuous integration surface and delivery reconciliation. The exact first integration should be chosen from target-ICP evidence and implementation economics. Likely candidates are Jira/Linear for delivery work and Slack/email for request intake.

Do not build four integrations simultaneously.

### SC-007 — change order

Keep but revise around a broader **commercial decision packet**. Paid change order is one outcome, not the only valid outcome.

### SC-008 — approval/audit

Keep. This is central to the closed-loop evidence chain.

### SC-009 — subscription/entitlements

Keep. Consider implementation earlier than the old roadmap if variable AI/integration costs become material. Test-mode billing architecture can proceed before public pricing is finalized.

### SC-010 / SC-011

Keep. Self-service onboarding and production hardening remain mandatory for the founder operating model.

## Research caveats

- Public Reddit research contains genuine practitioner discussion but also many 2026 founder-validation posts promoting newly built scope-creep products. Promotional threads were treated primarily as competitor/category evidence, not proof of demand.
- Stronger demand evidence comes from high-engagement practitioner threads, established PSA/agency products, and industry profitability research.
- No direct buyer interviews have been performed. The founder operating model makes synchronous interviews impractical, so the product should later collect asynchronous behavioral evidence and reasons for conversion/cancellation in-product.

## Decision checkpoint

Before unblocking SC-004, confirm the founder-level constraints/questions recorded in the CEO conversation and then revise `docs/PRODUCT.md`, `docs/ROADMAP.md`, and SC-004–SC-011 around the accepted commercial-control thesis.
