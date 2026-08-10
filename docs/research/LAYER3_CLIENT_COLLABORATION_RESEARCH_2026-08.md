# Layer 3 Client Collaboration, Negotiation and Acceptance Research — 2026-08

## Status

**Research checkpoint complete — product scope validated for engineering decomposition.**

This document is the durable Layer-3 product/research source of truth for SC-007. It follows completion of the Layer-2 Commercial Delivery Graph through SC-006A/B/C and PR #35.

## Executive conclusion

A generic branded client portal is not a defensible ScopeDelta product wedge. Current agency/project products already provide combinations of free/reduced-permission client seats, guest access, client-safe task views, request intake, messaging, proof review and approval.

ScopeDelta should instead extend its Commercial Delivery Graph into a deliberately small client-facing control loop:

> **One commercial truth, two projections. The delivery team works from the internal project and Commercial Delivery Graph; the client sees only the requests, commitments, decisions, impacts and acceptance actions that are relevant to them. Every client action is tied to the exact commercial or delivery version they saw.**

The Layer-3 wedge is therefore not “give clients access to project management.” It is:

> **Make client change negotiation and acceptance a native, versioned projection of the same commercial state that authorizes delivery work.**

The first useful client journey should be narrower than Jira/Linear/ClickUp-style guest access and more commercially precise than a generic agency portal.

## Research questions answered

The SC-007 checkpoint required validation of:

- real client/agency collaboration patterns;
- competitive client portal and guest-access boundaries;
- the minimum external identity and authorization model;
- the minimum client-safe project projection;
- client-native request intake;
- commercial decision publication and action semantics;
- deliverable/milestone acceptance;
- discussion and notification requirements;
- client-seat economics;
- Cloud versus self-host/LAN runtime dependencies;
- security/abuse boundaries;
- the smallest end-to-end engineering slice sequence.

## Market and competitor findings

### Teamwork

Teamwork has purpose-built client users. Its documentation describes client users as a free/reduced-permission license for bringing clients into selected projects, with capabilities such as project visibility, contextual task communication, creation/editing of certain project items, file access and task/milestone completion while excluding profitability, people management and broader planning/reporting areas.

Teamwork also provides a separate proof-review flow where external reviewers/approvers do not need a normal Teamwork user account. Approvers can review a version, request changes and approve it; approval state is version-oriented and all required approvers must act before final approval.

Product implication: free client collaboration and approval are already table stakes. ScopeDelta cannot differentiate merely by offering client accounts or an approve button.

Sources:
- https://support.teamwork.com/projects/using-teamwork/working-with-client-users
- https://support.teamwork.com/projects/proofing/review-and-approve-proofs
- https://support.teamwork.com/projects/proofing/create-a-proof

### Productive

Productive supports free client seats with restricted permissions. Clients can be invited to selected projects and, depending on configuration/plan, collaborate on tasks/docs and optionally receive selected budget/time visibility. Productive supports custom client permission sets and explicit project/budget access.

Product implication: “client seat with filtered project access” is mature agency-software behavior. ScopeDelta should avoid competing on generic permission breadth or PSA/budget visibility.

Sources:
- https://help.productive.io/en/articles/2179579-inviting-clients-to-productive
- https://help.productive.io/en/articles/2179600-what-can-a-client-see-after-joining-productive
- https://help.productive.io/en/articles/9273131-customizing-client-permissions

### ClickUp

ClickUp allows guests to access only explicitly shared locations/items and supports view/comment/edit/full-edit permissions on paid plans. Its client workflow guidance recommends private client-specific areas, guest sharing, statuses for reducing status emails and assigned comments for client approval.

Product implication: granular guest permissions and client task access are not a unique value proposition. Broad item-level ACL configuration also conflicts with ScopeDelta's “simple by default” product principle.

Sources:
- https://help.clickup.com/hc/en-us/articles/6310022323991-Guest-type-user-roles
- https://help.clickup.com/hc/en-us/articles/6309221065495-Permissions-in-detail
- https://help.clickup.com/hc/en-us/articles/6328082117527-How-to-work-with-clients-in-ClickUp

### Bonsai

Bonsai provides a branded client portal where clients can see projects, activity, files, invoices and selected tasks, upload files and message the team. Portal owners can control task/progress/billing/team visibility and preview what a client will see. Bonsai supports secure email-link access and client-specific visibility settings.

Product implication: branded project/status/file/messaging portals are a crowded category. ScopeDelta should not build portal branding, billing or general document sharing as the Layer-3 wedge.

Sources:
- https://help.hellobonsai.com/en/articles/4409019-how-to-use-the-client-portal
- https://help.hellobonsai.com/en/articles/10003632-sharing-and-managing-tasks-through-your-client-portal

### Jira Service Management

Jira Service Management provides a customer-facing help center/request model. Customers can submit and track requests, while workflows can include approval steps. Approvers do not require normal JSM agent licenses; they act as service-space customers and may approve/decline from the help center or supported notification channels.

Product implication: request intake plus workflow approval is established service-management behavior. ScopeDelta must tie client action specifically to commercial delivery provenance rather than reproduce a generic service desk.

Sources:
- https://support.atlassian.com/jira-service-management-cloud/docs/add-customers-and-learn-how-they-request-help/
- https://support.atlassian.com/jira-service-management-cloud/docs/what-are-approvals/
- https://support.atlassian.com/jira-service-management-cloud/docs/set-up-approvals/

### Linear

Linear Customer Requests link customer feedback to issues/projects and preserve source/customer context. However, Linear's own documentation states that guests do not see Customer Requests. The feature is primarily an internal product-development/customer-feedback model rather than an external client collaboration surface.

Product implication: ScopeDelta can be meaningfully different by allowing the client to participate in a tightly controlled version of the request/decision loop while the delivery team retains the internal graph and work detail.

Source:
- https://linear.app/docs/customer-requests

### Agency-specific portal products

Agency-oriented products such as AgencyHandy already market client portals with service/request intake, project progress, feedback, file review and approvals. This reinforces that “agency portal” is a category, not a USP.

Source:
- https://www.agencyhandy.com/client-portal/
- https://www.agencyhandy.com/solutions/project-management-software/

## Workflow evidence and problem interpretation

Across the reviewed products, the recurring client-facing jobs are:

1. know what requires attention;
2. understand current project/deliverable status without reading internal tickets;
3. submit a request or clarification;
4. review a proposed response/change;
5. approve, reject or request clarification;
6. review delivered output and accept/request changes;
7. communicate in context;
8. retain a written/versioned record of what was requested and approved.

Public software-delivery discussions also repeatedly show a failure mode where ambiguous requests or incomplete requirements turn directly into implementation assumptions and later rework. The important ScopeDelta opportunity is not simply more communication; it is preserving the decision boundary between “client asked,” “team interpreted,” “commercial treatment decided,” “client saw/accepted,” and “work was authorized/performed.”

## Validated Layer-3 USP

### Primary proposition

> **One commercial truth, two projections: internal delivery and client-safe collaboration.**

### More explicit product statement

> **ScopeDelta gives clients a simple request, change and acceptance surface that is generated from the same Commercial Delivery Graph the delivery team uses. A client never needs the internal backlog, and the team never needs to re-type the commercial truth into a separate portal.**

### Why this is stronger than a generic portal

The differentiating relationship is:

`Client request → internal commercial treatment → immutable client-visible packet → client action/evidence → delivery commercial basis → later acceptance/history`

The client interface is a projection of authoritative records, not an independent second project-management system.

## Product design principles for Layer 3

### 1. Clients do not get the internal board

The default client experience must not expose:

- internal backlog/work-item hierarchy;
- developer/QA implementation detail;
- internal estimates or capacity planning;
- internal comments/notes;
- commercially unlinked/stale-work warnings;
- provider-only commercial rationale;
- AI/provider metadata;
- repository/CI details unless a later layer explicitly publishes evidence;
- unrelated projects/clients;
- workspace membership/directory data;
- internal audit data.

### 2. “Needs your attention” beats a miniature PM suite

The client home should prioritize:

- items awaiting the client's action;
- current client-visible milestones/deliverables;
- the client's requests and their client-safe state;
- published commercial decisions/proposals;
- later, acceptance items;
- recent client-visible updates.

Do not ship a configurable client dashboard builder in Layer 3.

### 3. Publication is explicit

Internal records are not automatically client-visible merely because they exist.

A project/milestone/deliverable may have a simple client-visible projection policy. Commercial decisions/proposals require explicit publication because they can contain binding money/timeline/deliverable commitments.

### 4. Published commercial targets are immutable

The exact client-visible representation must be reconstructable after publication. Later internal edits create a new publishable version rather than silently changing what the client previously reviewed.

### 5. External action is evidence, not legal e-signature

ScopeDelta records business workflow evidence: who acted, when, on which published version, and what action they took. It must not claim qualified/legal electronic signature status or identity assurance that the product has not implemented.

### 6. Internal authority and client acceptance remain distinct

An internal Layer-2 decision is not proof that the client accepted it. A client action is not permission to bypass internal authorization rules.

Layer 3 adds external publication/acceptance evidence to the existing Commercial Delivery Graph. Any transition that changes effective delivery authorization must continue to pass normal server-side internal authority/domain rules.

### 7. Avoid permission-builder complexity

The first model should use purpose-built external roles/capabilities, not Jira-scale custom permission matrices.

## Minimum client journey

The validated minimum end-to-end Layer-3 journey is:

1. Internal authorized user adds a client contact to one project.
2. Client accepts a project-scoped invitation and signs in to a client-safe experience.
3. Client sees a compact project home with “needs your attention,” selected milestones/deliverables and their own request/decision history.
4. Client submits a request or clarification in their own language.
5. The request enters the existing SC-006B request lifecycle for internal triage; it does not authorize work by itself.
6. Internal PM/commercial owner records the appropriate Layer-2 treatment and prepares a client-visible packet when client communication/action is required.
7. Authorized internal user explicitly publishes an immutable packet version.
8. Client sees the exact proposal/decision context and, where required, approves, rejects or requests clarification.
9. ScopeDelta records actor/time/version/action as client evidence without mutating already published history.
10. Internal delivery users can trace the resulting commercial basis/work back through the request, decision, client-visible version and client action.
11. Later in Layer 3, client can accept a delivered milestone/deliverable or request changes against a versioned acceptance target.

## External identity and authorization model

### Initial identity choice

For ongoing client collaboration, use **account-backed external client participants** rather than making the entire portal accessible through reusable public links.

Reasoning:

- clients need persistent request/history access, not one isolated action;
- projects may have several client contacts;
- revocation and historical attribution matter;
- project isolation is easier to reason about with an authenticated principal;
- it aligns with the existing ScopeDelta account/auth boundary;
- it works in Cloud and self-host/LAN deployments.

High-entropy, time-bounded invitation tokens may bootstrap access. A self-host deployment without outbound email must be able to generate/copy an invitation URL manually. ScopeDelta Cloud can deliver invitations through managed email once the managed notification boundary exists.

### Initial external roles

Keep roles deliberately small:

- **Client collaborator** — can view client-safe project state, submit requests/clarifications and participate in client-visible discussion where enabled.
- **Client approver** — client collaborator capabilities plus commercial decision actions and, when introduced, delivery acceptance actions.

A project may have multiple client contacts. Internal authorized users explicitly decide which contacts have approver capability.

Do not create arbitrary per-field ACL construction in Layer 3.

### Project scope

External participants are project-scoped. They do not become normal workspace members and do not inherit public/internal workspace content.

Removal/revocation removes future access but preserves historical actor attribution on prior requests/actions.

## Client-safe projection model

### Safe/eligible projection

The client may see, when configured/published:

- project name and client-safe summary;
- selected milestone/deliverable name, status and target date where appropriate;
- explicit client-visible status/update text;
- the client's requests and client-safe lifecycle state;
- published commercial packet versions;
- client-visible discussion attached to external-safe records;
- later acceptance records;
- evidence/file references that were explicitly shared.

### Internal-only by default

Do not expose by default:

- individual internal work items;
- subtasks/dependencies;
- internal estimates/points;
- assignee workload;
- internal comments/activity;
- internal project notes;
- commercial source document bodies;
- internal decision rationale/notes not included in the published packet;
- unconfirmed impact estimates;
- commercial drift classification;
- internal audit/event history;
- internal team/member directory;
- QA/Git/CI details before Layer 4 defines explicit publication semantics.

### Status/progress rule

Do not invent an automatic “% complete” from task counts as the primary project truth. A 90% task-completion number can be commercially or operationally misleading.

Prefer milestone/deliverable states and explicit client-visible dates/status derived from authoritative records.

## Client request intake

Client-native request submission belongs in the first Layer-3 engineering slice because it closes a critical context gap and immediately uses the Layer-2 request model.

Initial requirements:

- project-scoped client can submit a concise request/question;
- preserve client actor and submitted time;
- preserve original client text as request evidence under the existing privacy boundary;
- request begins as `open` and does not authorize work;
- internal triage may move it to `needs_clarification`, resolve it through a commercial decision, or withdraw/close according to existing domain semantics;
- client receives a client-safe lifecycle view, not internal commercial notes;
- duplicate/retried submissions are idempotent enough not to create accidental repeated commercial questions.

Attachments are useful but are not required to block the first slice. If included, reuse bounded/private source storage and external-upload authorization. Do not expand Layer 3 into broad media annotation or OCR.

## Commercial publication and action semantics

### Client-visible commercial packet

A packet is an immutable client-visible version derived from selected authoritative request/decision/baseline information.

Minimum client-visible content may include:

- project and request identity;
- concise original/request summary;
- plain-language treatment;
- what is changing or not changing;
- relevant agreed deliverable/scope references;
- confirmed client-visible fee/currency for paid changes when applicable;
- confirmed client-visible schedule/date impact when applicable;
- client-visible assumptions or clarification needed;
- required client action;
- publication/version metadata.

Do not automatically expose internal effort estimates, margin, cost, notes or unconfirmed impact fields.

### Publication rules

- only an authorized internal project/commercial user can publish;
- money/timeline/deliverable commitments must already be internally confirmed before publication;
- published content is immutable;
- edits create a successor packet version;
- the currently actionable version is explicit;
- superseded/stale versions remain readable for history but cannot receive a contradictory new final action;
- retrying an action is idempotent.

### Default client action by commercial disposition

| Commercial disposition/state | Default client action |
|---|---|
| `covered` | Informational; client may request clarification. No approval required by default. |
| `absorbed` | Informational/goodwill; client may request clarification. No paid-change approval required. |
| `swap` | Client approve / reject / request clarification before treating the swap as client-accepted. |
| `paid_change` | Client approve / reject / request clarification before treating the paid change as client-accepted. |
| `deferred` | Informational; client may request clarification. |
| `rejected` | Informational; client may request clarification. |
| request `needs_clarification` | Client supplies clarification/answer; this is not approval. |

This is a product default, not a claim about legal enforceability. Organizations may later need configurable policy, but custom workflow builders are not Layer-3 scope.

### Relationship to Layer-2 authorization

Layer 3 must not rewrite SC-006B history.

The system should be able to distinguish:

- internally confirmed commercial treatment;
- published-to-client version;
- client action on that exact version;
- current delivery authorization;
- later amendment/formalization.

If an organization chooses to start work before external client acceptance, ScopeDelta may preserve that internal decision, but the client-facing state must not falsely say the client approved it.

## Deliverable/milestone acceptance

Client acceptance is valuable, but it is not required in the first identity/request slice.

It should be the third Layer-3 slice after commercial publication/action works reliably.

Minimum acceptance model:

- internal user publishes a client-visible acceptance target for a milestone/deliverable;
- target is versioned/immutable enough to reconstruct what was accepted;
- client approver can `accept` or `needs_changes`;
- acceptance records actor/time/version and optional client comment;
- later edits do not rewrite earlier acceptance;
- acceptance is business delivery evidence, not a legal warranty/e-signature claim;
- later Layer 4 can connect QA/release evidence to the same acceptance chain.

Do not build rich creative-asset proof annotation in this layer; Teamwork and dedicated proofing products already cover that market deeply.

## Client-safe discussion

Discussion is useful but must not reuse internal comments through an easy-to-misclick visibility toggle.

Preferred product rule:

- client-visible discussion exists only on external-safe objects such as client requests, published commercial packets and acceptance targets;
- internal notes/comments remain a separate internal channel;
- the composer/surface makes external visibility unmistakable;
- internal comments cannot become client-visible accidentally through inheritance.

This can ship with the commercial/acceptance slices rather than being a prerequisite for the first identity/request slice.

## Notifications

### Core notification state

Notification/inbox state is part of the ScopeDelta server and should remain **Local/LAN**.

### Outbound delivery

Outbound email is **Hybrid/optional external**:

- ScopeDelta Cloud may provide managed email;
- self-host can configure SMTP/another customer-controlled mail route;
- lack of outbound email must not make project/commercial state invalid;
- invitation and action URLs should be retrievable by an authorized internal user for manual delivery when no email provider exists.

Email delivery failure must never roll back a valid request, publication or client action.

Do not make an external email SaaS a mandatory Layer-3 product dependency.

## Runtime/dependency conclusion

The current runtime matrix over-classifies Layer-3 core capabilities as hybrid/external.

The validated model is:

| Capability | Runtime class | Layer-3 decision |
|---|---|---|
| External client users/invites | Local/LAN | Account/project participant state and invite tokens are core server behavior; outbound invite email is optional. |
| Client-safe project portal | Local/LAN | Same ScopeDelta server/domain data. |
| Client request intake | Local/LAN | Extends existing SC-006B request domain. |
| Client-safe discussion | Local/LAN | Server-authoritative project data. |
| Negotiation/change packet | Local/LAN | Versioned projection of Layer-2 records. |
| Approve/reject/clarify | Local/LAN | Authenticated domain actions. |
| Milestone/deliverable acceptance | Local/LAN | Authenticated/versioned domain action. |
| Immutable shared versions | Local/LAN | Core relational/audit state. |
| Outbound email notifications | Hybrid/optional external | Managed email or customer SMTP; not required for authoritative state. |
| Public/action links | Local/LAN, deferred by default | Token/link generation can be local, but ongoing client portal uses authenticated accounts initially. |

Layer 3 therefore introduces **no mandatory paid external service**.

The 98-capability inventory can remain unchanged while runtime-class totals are revised.

## Client-seat economics conclusion

Teamwork and Productive both position client access as free/reduced-cost relative to internal users. This matches the economic role of client participation: clients are not internal production seats and charging every client contact like an employee discourages the very collaboration ScopeDelta needs for differentiation.

Product commitment:

- external client participants should **not consume normal paid internal employee seats**;
- exact hosted-plan limits/pricing remain a later founder/commercial decision under SC-010;
- anti-abuse/fair-use limits may exist, but client participation should be generous enough that an agency does not ration legitimate client contacts.

## Security and abuse boundary

Required Layer-3 security principles:

- project-scoped external principals; no implicit workspace membership;
- server-side authorization on every external read/mutation;
- high-entropy, time-bounded, single-purpose invitation tokens;
- invitation acceptance binds to an account/client participant before ongoing access;
- revocation blocks future access immediately while preserving historical attribution;
- no predictable/enumerable project/client IDs as authorization;
- no cross-client/project data by URL/payload manipulation;
- sensitive client surfaces use private/no-store/no-index behavior appropriate to authenticated project data;
- CSRF/replay/idempotency protection on significant external mutations;
- rate/abuse limits on login/invite/request/action endpoints;
- published packet and acceptance actions target an exact version;
- stale/superseded versions cannot receive new contradictory final actions;
- ordinary logs/audit metadata do not copy client request bodies or confidential commercial document text;
- external file upload, if included, reuses bounded type/size/storage validation and never trusts client-supplied metadata.

Public unauthenticated project portals are explicitly not required for Layer 3.

## Recommended Layer-3 engineering sequence

### SC-007A — External client boundary, client-safe project home and request intake

**Outcome:** an agency can invite a client contact into exactly one project; the client sees a deliberately small project surface and can submit/track a request that enters the existing commercial request lifecycle.

Scope:

- external client participant + collaborator/approver capability foundation;
- invite/accept/revoke lifecycle;
- strict project/client authorization;
- client-safe project home;
- selected milestone/deliverable projection;
- “needs your attention” foundation;
- client request submission + client-safe request history/state;
- privacy/cache/no-index/rate/idempotency coverage;
- Local/LAN operation with optional email delivery, not mandatory provider dependence.

Why first: this is the minimum closed-loop external surface and validates client adoption without waiting for the most sensitive commercial-action code.

### SC-007B — Immutable commercial publication and client decision actions

**Outcome:** internal PM can publish a versioned client-safe commercial response/change packet and an authorized client approver can take the appropriate action on the exact version.

Scope:

- client-visible packet versioning;
- publish/supersede lifecycle;
- plain-language Layer-2 disposition projection;
- confirmed fee/schedule/deliverable impact publication;
- approve/reject/request-clarification where applicable;
- stale-version/idempotent action handling;
- actor/time/version evidence;
- trace request → decision → publication → client action → commercial/delivery context;
- client-visible discussion on request/packet if needed for a usable clarification loop.

### SC-007C — Delivery acceptance and client-collaboration hardening

**Outcome:** client can formally accept or request changes to a published milestone/deliverable target, with recoverable notifications and complete Layer-3 history.

Scope:

- versioned milestone/deliverable acceptance target;
- accept / needs-changes action;
- client-visible acceptance history;
- client-safe discussion hardening;
- in-app notification/inbox extension;
- optional outbound email delivery/retry;
- invitation/action recovery;
- multiple client contacts/approvers edge cases;
- Layer-3 end-to-end browser tests and scale/security hardening.

## Layer-3 exit criteria

Layer 3 is complete when:

- a client has a project-scoped account/participant experience without internal workspace access;
- client sees only an intentional project projection;
- client can submit a request and track its client-safe lifecycle;
- internal user can publish an immutable client-visible commercial packet from authoritative Layer-2 state;
- appropriate client approver can act on the exact packet version;
- old published versions remain reconstructable and cannot receive contradictory actions;
- internal authorization, external client acceptance and later amendment history remain distinguishable;
- client can accept/request changes on configured milestone/deliverable targets;
- internal and client-visible discussion cannot leak through accidental visibility inheritance;
- notifications are recoverable and provider failure does not corrupt state;
- cross-client/project access is negative-tested;
- required workflow runs in ScopeDelta Cloud and customer self-host/LAN without mandatory paid external services;
- CI, migrations, production build/container and representative browser flows pass.

## Explicit Layer-3 non-goals

- full CRM/sales pipeline;
- client access to the internal engineering backlog by default;
- Jira/ClickUp-style generic guest permission builder;
- general-purpose branded portal builder/white-label website CMS;
- invoice/payment collection or PSA billing engine;
- legal e-signature/identity verification;
- CLM/legal redlining;
- creative proof annotation/markup suite;
- shared-drive/file-management replacement;
- public anonymous project status pages;
- real-time Slack/Teams replacement;
- AI client communication automation — SC-009;
- Git/PR/CI/QA evidence — SC-008;
- automatic email/Slack/CRM ingestion;
- mandatory external email provider.

## Product metrics to validate after implementation

Layer 3 should later measure, without logging client content:

- time from project client invitation to first client activation;
- percentage of active client projects with at least one active client participant;
- percentage of client requests created directly through ScopeDelta versus manually re-entered by the delivery team;
- median request → internal decision → published packet → client action time;
- percentage of actionable published packets resolved without manual status reconstruction;
- number/rate of stale packet action attempts;
- client request/approval activity per active project;
- PM-reported reduction in repeated status/approval chasing during customer discovery.

These are outcome metrics, not a requirement to build a large analytics product in SC-007.

## Decisions made by this checkpoint

1. Generic portal/guest access is table stakes, not the Layer-3 USP.
2. ScopeDelta's differentiator is a client-safe projection of the Commercial Delivery Graph.
3. Ongoing client access uses authenticated project-scoped external participants initially.
4. Keep two simple external capabilities: collaborator and approver; no generic permission builder.
5. Client request intake belongs in the first engineering slice.
6. Internal records are not automatically client-visible; publication is explicit where commercial commitments are involved.
7. Published commercial packets are immutable/versioned.
8. Paid-change and swap packets require client approve/reject/clarify by default before being represented as client-accepted.
9. Covered/absorbed/deferred/rejected outcomes are informational by default with clarification available.
10. Internal commercial treatment and client acceptance are distinct evidence states.
11. Deliverable/milestone acceptance belongs in Layer 3 but after the commercial packet loop.
12. Client-visible discussion is separated structurally from internal comments.
13. Core Layer-3 capability is Local/LAN; outbound email is optional Hybrid.
14. Layer 3 requires no mandatory paid external provider.
15. Client participants should not consume normal paid internal employee seats; exact plan limits/pricing remain later scope.
16. Implement SC-007 as three vertical slices: 007A → 007B → 007C.

## References

Internal:

- SC-007 / #11
- SC-006 / #10 — complete
- SC-006A / #30 — complete
- SC-006B / #31 — complete
- SC-006C / #32 — complete through PR #35
- `docs/research/LAYER2_COMMERCIAL_DELIVERY_GRAPH_RESEARCH_2026-08.md`
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- `docs/ARCHITECTURE.md`
- `docs/decisions/ADR-005-ai-native-client-delivery-os.md`

External research sources:

- Teamwork client users: https://support.teamwork.com/projects/using-teamwork/working-with-client-users
- Teamwork proof approval: https://support.teamwork.com/projects/proofing/review-and-approve-proofs
- Teamwork proof creation/versioning: https://support.teamwork.com/projects/proofing/create-a-proof
- Productive client invitation: https://help.productive.io/en/articles/2179579-inviting-clients-to-productive
- Productive client visibility: https://help.productive.io/en/articles/2179600-what-can-a-client-see-after-joining-productive
- Productive client permissions: https://help.productive.io/en/articles/9273131-customizing-client-permissions
- ClickUp guest roles: https://help.clickup.com/hc/en-us/articles/6310022323991-Guest-type-user-roles
- ClickUp permissions: https://help.clickup.com/hc/en-us/articles/6309221065495-Permissions-in-detail
- ClickUp client workflow: https://help.clickup.com/hc/en-us/articles/6328082117527-How-to-work-with-clients-in-ClickUp
- Bonsai client portal: https://help.hellobonsai.com/en/articles/4409019-how-to-use-the-client-portal
- Bonsai client tasks: https://help.hellobonsai.com/en/articles/10003632-sharing-and-managing-tasks-through-your-client-portal
- Jira Service Management customers: https://support.atlassian.com/jira-service-management-cloud/docs/add-customers-and-learn-how-they-request-help/
- Jira Service Management approvals: https://support.atlassian.com/jira-service-management-cloud/docs/what-are-approvals/
- Linear Customer Requests: https://linear.app/docs/customer-requests
- AgencyHandy client portal: https://www.agencyhandy.com/client-portal/

## Next action

Update product/roadmap/runtime artifacts, convert SC-007 into a research-complete tracking parent, create SC-007A/B/C engineering issues, and mark **only SC-007A** `READY FOR CODEX`.