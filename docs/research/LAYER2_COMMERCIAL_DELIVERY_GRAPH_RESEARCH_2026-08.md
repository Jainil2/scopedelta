# Layer 2 Commercial Delivery Graph Research — 2026-08

## Status

Research checkpoint completed 2026-08-09 for SC-006.

Decision: **do not implement the existing SC-006 as one large issue.** Split Layer 2 into production-usable vertical slices. The Commercial Delivery Graph remains ScopeDelta's primary differentiated product wedge, but the previous draft mixed request workflow state, commercial outcomes, scope provenance, document intelligence, and drift policy into one taxonomy/scope.

The first executable slice may become `READY FOR CODEX` only after the SC-006 parent, child issues, roadmap/runtime control artifacts, and this research all point to the same model.

## Research question

What is the minimum evidence-backed commercial model that lets a 50–500-person software-service organization continuously answer why delivery work exists, without rebuilding a PSA/CRM/contract-management suite or prematurely pulling SC-009 AI scope into Layer 2?

## Research method and limits

Reviewed current primary documentation for delivery/project tools, PSA/commercial systems, requirements traceability, and adjacent scope-management products. The review focused on actual object/workflow behavior rather than feature-count parity. Practitioner/service-firm material was used directionally to test real change-control patterns.

The market scan is not a statistically representative customer study. Product validation with live agencies remains required, but the evidence is sufficient to define the Layer-2 production model and first engineering slice without inventing a giant speculative platform.

## Major findings

### 1. PSA systems are strong at financial control, but usually weak at item-level commercial provenance

**Productive** connects won deals to budgets and carries services, estimates, bookings, cost/revenue and billing rules into delivery. Services are the commercial/financial building blocks and budgets show planned versus worked/billed/scheduled values. This is strong agency financial control, but the reviewed workflow is service/budget centric rather than a durable `client request → commercial decision → specific engineering work item` authorization graph.

**Scoro** goes further toward delivery traceability. Quote line items can represent deliverables; a quote can become a project; quoted services can become tasks; the resulting time and financial budget details stay linked. This is important partial competitive overlap: ScopeDelta cannot claim that connecting sold work to tasks is novel by itself. The gap is the ongoing post-sale decision history around requests, defects, revision allowances, goodwill, swaps, deferrals, rejections and approved additions.

**Kantata** provides project snapshots/baselines that preserve what was originally sold and budget/schedule change orders with proposed/approved/declined history. Its baseline captures task and project financial/schedule state, while change orders adjust project budget or schedule. This is mature plan-versus-actual/change-control behavior, but the reviewed model remains project/task/financial state oriented rather than evidence-anchored commercial lineage from agreement clause through request and authorization to delivery work.

Product implication: ScopeDelta should not compete by building another PSA budget, rate-card, timesheet or invoice engine in Layer 2. The differentiated object is **commercial provenance attached to daily delivery work**.

### 2. Jira/Linear can connect requests to engineering, but not commercial authorization as a first-class semantic

Linear Customer Requests can preserve a source message, customer, timestamp and link to issues/projects. Its Salesforce integration can turn or link cases into Linear issues/projects and synchronize customer context. That materially reduces the novelty of simply attaching a client/customer request to a ticket.

Jira/Jira Service Management similarly supports request intake, forms, approvals, work-item links and custom fields. These primitives are flexible enough for teams to encode commercial state manually.

The failure is semantic and operational: a generic request/work link does not answer whether the work is already owed, warranty/defect work, within a revision allowance, consciously absorbed, swapped against another commitment, deferred, rejected, or separately paid. Teams can model this with fields, documents and conventions, but the commercial relationship is not the opinionated system of record.

### 3. Requirements traceability is mature; the commercial semantics are the opportunity

Requirements-management products such as Perforce Helix ALM already support versioned requirements, trace links, impact analysis, baselines and suspect-link/change review. Therefore a graph, baseline, or trace link is not independently novel.

ScopeDelta's wedge is the **commercial interpretation of those relationships inside a software-service delivery workflow**: what was sold, what changed, who authorized the commercial treatment, and which actual work consumed capacity because of it.

### 4. Narrow AI SOW-check/change-order products already exist

Current products including ScopeGuard, Fenscope, ScopeAuditor and similar tools already offer variants of SOW upload, AI in/out-of-scope classification, clause citations, estimated impact, reply generation and change-order generation. Vinrova ScopeTrack also markets an immutable/frozen scope baseline, versioning, change requests, approval history, cost/deadline impact and client approval.

Therefore **`upload SOW → paste request → AI verdict → generate change order` is not a defensible ScopeDelta USP**. SC-009 may later make classification faster, but Layer 2 must create durable product value without AI.

### 5. Real change control is not binary in-scope/out-of-scope

Service-delivery practice distinguishes a request from its commercial treatment. A request can be covered by the existing agreement, a defect/fix obligation, a permitted revision, intentionally absorbed as goodwill, exchanged for other committed scope, deferred, rejected, or accepted as additional paid work.

A formal change order/amendment is only one outcome. Treating every change as `in scope / out of scope` or `change order / no change order` would create poor UX and encourage teams to work around the product.

### 6. The request, the decision, and the amendment are separate objects

A client request is evidence of intent, not proof of commercial authorization. A commercial decision records the provider's effective treatment of that request. A signed amendment/change order is evidence that can update the commercial baseline; it should not overwrite the original agreement or erase the decision history that led to it.

This separation is central to the final graph.

## Layer-2 differentiated wedge

> **ScopeDelta makes commercial provenance a first-class property of delivery work. Every material client-deliverable work item can point to the effective baseline commitment or confirmed commercial decision that authorizes it, while unresolved/unclassified relationships are surfaced before capacity is silently consumed.**

The advantage is not the graph data structure itself. It is the opinionated software-service workflow and its continuous projection into the same daily work system built in Layer 1.

## Commercial decision taxonomy — revised

The SC-006 draft mixed three concepts:

- commercial provenance (`included in baseline`);
- commercial outcomes (`paid change`, `absorbed`, `swap`, `defer`, `reject`);
- request workflow state (`clarification required`).

They should be separated.

### Request lifecycle

Minimum request state:

- `open` — unresolved commercial question;
- `needs_clarification` — more information is required before a decision;
- `resolved` — an effective commercial decision exists;
- `withdrawn` — request no longer needs a decision.

`needs_clarification` is **not** a commercial decision.

### Confirmed commercial dispositions

Minimum effective decision outcomes:

1. **covered** — the current agreement already obligates the provider to perform the work;
2. **absorbed** — incremental work is knowingly accepted without additional client charge;
3. **swap** — new/changed work is accepted in exchange for reducing/removing another current commitment;
4. **paid_change** — incremental work is commercially authorized as additional paid scope;
5. **deferred** — not authorized for the current scope/phase and intentionally moved later;
6. **rejected** — explicitly not to be performed.

For `covered`, preserve an optional coverage basis such as `baseline`, `defect_or_warranty`, `revision_allowance`, or `other_existing_obligation`. These are reasons under the same commercial treatment, not top-level outcomes.

A direct work-to-baseline-scope relationship remains valid provenance without manufacturing a redundant `covered` decision for every original ticket.

Decision records must be immutable/supersedable enough to reconstruct who confirmed the treatment, when, the request/baseline context, notes/reason, and supporting evidence. Only a confirmed/effective decision may authorize delivery work. A product record is not a substitute for legal/e-signature identity; client-native approval UX remains SC-007.

## Final Commercial Delivery Graph

The graph is a **logical domain graph on the existing relational/server-authoritative core**. No separate graph database is justified by the required queries.

### Minimum entities

1. **Commercial evidence source**
   - immutable original pasted text or uploaded source document;
   - source metadata, content hash, parser state and private authorization boundary;
   - deterministic extracted text where available.

2. **Evidence anchor**
   - stable reference from a graph record back to the relevant source text/page/paragraph/offset;
   - lets a PM inspect why a scope item or request exists without copying entire documents into logs/audit metadata.

3. **Commercial baseline**
   - the logical agreed commercial scope for one project/engagement.

4. **Baseline version**
   - immutable point-in-time initial baseline or later amendment version;
   - versions never rewrite prior history;
   - engineering may choose the relational revision representation, but item lineage must remain reconstructable.

5. **Commercial scope item**
   - one evidence-backed baseline item;
   - minimum kinds: `deliverable`, `requirement`, `exclusion`, `constraint`;
   - a single entity/table is preferred over separate schemas for each kind;
   - optional parent/lineage relationship may express useful hierarchy/version continuity without building a requirements-management suite.

6. **Client request**
   - one atomic commercial question/ask with original language/evidence, received time and internal provenance;
   - manual creation is sufficient in Layer 2;
   - if one client message contains requests requiring different dispositions, users create separate request records that may reference the same source evidence. Automatic subrequest decomposition belongs to SC-009.

7. **Commercial decision**
   - resolves a request with one effective disposition;
   - preserves actor/time/reason/evidence and supersession history;
   - links affected baseline items and resulting work where relevant.

8. **Impact assessment**
   - optional effort, schedule and monetary impact attached to a request/decision;
   - explicitly distinguishes estimate from confirmed fact/commitment;
   - monetary values use exact decimal semantics plus currency code;
   - the software never invents binding price or date commitments.

9. **Work item**
   - existing Layer-1 work item; no duplicate delivery-ticket system.

10. **Commercial basis relationship**

- links a work item to one or more effective baseline scope items and/or confirmed commercial decisions;
- this edge is the core differentiating relationship used by drift UX.

### Important relationships

- Project → Commercial baseline → Baseline versions.
- Baseline version → Commercial scope items.
- Scope item → Evidence anchor → Evidence source.
- New baseline version/amendment → prior version/item lineage without destructive rewrite.
- Client request → source evidence and zero/many affected scope items.
- Confirmed commercial decision → resolves request and may affect scope items.
- `swap` decision → explicitly identifies the commitment(s) being reduced/removed as well as the accepted request/work.
- Commercial decision → optional impact assessments.
- Work item → one/many commercial basis relationships to effective scope items or confirmed decisions.
- Historical links remain interpretable after scope supersession, project completion, user removal or archive.

## Work-purpose classification and advisory drift UX

Treating every project ticket without a contract link as scope creep would create immediate false-positive fatigue. Technical enablement, QA infrastructure, refactoring and project administration may be legitimate work without being separate contract deliverables.

Minimum work-purpose state:

- `unclassified` — default for existing/new work until explicitly classified;
- `client_delivery` — material client-facing/committed work; a commercial basis is expected;
- `delivery_support` — technical/QA/project work required to deliver the engagement but not independently sold/requested;
- `internal` — provider-internal/admin/non-client work.

Advisory project UX should distinguish:

1. **Commercially unlinked** — `client_delivery` work with no effective commercial basis; highest-severity warning.
2. **Needs classification** — `unclassified` work; lower-severity hygiene warning.
3. **Linked** — work authorized by current baseline item or confirmed decision.
4. **Support/internal** — no direct commercial basis required.
5. **Stale/superseded basis** — later slice warning when the linked baseline item has changed or been superseded.

Warnings do not block status changes or delivery by default. Organization-level hard gates remain a later policy capability.

Work-item UI should expose compact provenance (`Baseline`, `Change`, `Absorbed`, `Swap`, `Internal`, `Needs link`, etc.) without displaying unnecessary contract text to developers. PM/commercial views provide the deeper evidence.

## Document ingestion decision

### Required first-production formats

Support in the first Layer-2 production slice:

1. **Pasted plain text** — zero-file fallback and useful for proposals/contract extracts.
2. **Text-based PDF** — common final SOW/proposal artifact.
3. **DOCX** — common editable proposal/SOW source.

TXT may be accepted trivially if engineering gets it essentially for free, but it is not a separate product requirement.

### Explicitly not required in the first slice

- scanned/image-only PDF OCR;
- PNG/JPEG contract screenshots;
- legacy `.doc`;
- Excel/PowerPoint commercial documents;
- Google Drive/OneDrive/Dropbox ingestion connectors;
- email/Slack/meeting automatic capture;
- e-signature platform ingestion;
- semantic AI extraction of deliverables/exclusions/requirements;
- autonomous request-vs-scope classification.

If a PDF has no useful extractable text, the system should preserve a recoverable/understandable unsupported-or-needs-OCR state and let the user paste text instead. Optional OCR can remain Hybrid/later only when customer evidence justifies its operational complexity.

### Deterministic Layer-2 parsing boundary

Layer 2 ingestion is deterministic infrastructure:

- validate type/size safely;
- store the original source privately;
- extract normalized text and stable evidence anchors where supported;
- expose parse success/failure/retry/replacement state;
- let an authorized human create/curate scope items and select evidence anchors;
- never fabricate absent clauses/categories.

SC-009 owns AI-assisted semantic extraction, request comparison, classification suggestions and automated decomposition. Keeping that boundary prevents Layer 2 from acquiring model-provider/cost/privacy dependencies before the durable graph exists.

## Runtime/dependency implications

Layer-2 core must remain **Local/LAN** and run on the same server-authoritative product in ScopeDelta Cloud or a customer-controlled deployment.

Requirements:

- no mandatory AI/model API;
- no mandatory SaaS document parser;
- document storage must have a customer-controlled deployment path and a managed-cloud-compatible persistent path; exact storage implementation is Codex-owned;
- PDF/DOCX deterministic parsing should run inside the application/runtime or another deployable component that works in both managed and self-host modes;
- no new paid service may be required without founder approval;
- source documents, extracted text and request content stay outside ordinary application/audit logs;
- private-source authorization remains tenant/project scoped;
- bounded document/file/text limits and recoverable parser failures are required;
- scanned-document OCR remains optional/Hybrid and must not become a hidden ScopeDelta Cloud dependency.

The relational PostgreSQL core remains appropriate. The required graph queries are bounded project relationships and do not justify a graph database.

## What not to build in Layer 2

Do not build:

- invoice/accounting/timesheet/rate-card/PSA replacement;
- CRM sales pipeline;
- generic contract lifecycle management or clause library;
- e-signature/legal identity system;
- public client portal/approval links — SC-007;
- repository/PR/CI/QA evidence — SC-008;
- AI SOW extraction/classification/automatic scope verdicts — SC-009;
- automatic Slack/email/client-channel capture;
- universal requirements-management/custom relation platform;
- workflow/rules engine;
- hard commercial delivery gate by default;
- graph database infrastructure without demonstrated query need;
- broad OCR/image/document conversion stack before demand;
- autonomous pricing or date commitments.

## Slice decision and implementation sequence

### SC-006A — Commercial baseline, evidence, work provenance and advisory drift

First production-usable slice and highest activation dependency.

Outcome: an existing ScopeDelta project can import its actual commercial source, curate an evidence-backed baseline, classify client-delivery vs support/internal work, link delivery work to agreed scope, and see commercially unlinked work immediately.

Includes:

- paste + text-PDF + DOCX source ingestion;
- private source storage and deterministic anchors;
- initial baseline/version foundation;
- commercial scope items;
- work-purpose classification;
- work-to-baseline commercial basis links;
- advisory `commercially unlinked` and `needs classification` UX;
- history/authorization/audit and Local/LAN reliability.

This slice proves the differentiated relationship before building the entire change-order lifecycle.

### SC-006B — Client request and commercial decision ledger

Outcome: PM/commercial users can capture a real client request, move it through clarification/resolution, record one of the six commercial dispositions, attach impacts/evidence, and link authorized resulting work.

Includes:

- atomic request records;
- request lifecycle;
- `covered / absorbed / swap / paid_change / deferred / rejected` decisions;
- coverage-basis detail;
- impact assessments;
- decision-to-work commercial basis links;
- unresolved-request and decision views;
- swap integrity and superseded-decision history.

### SC-006C — Amendments, lineage and drift reconstruction hardening

Outcome: a project can evolve through commercial amendments without rewriting history, and PMs can reconstruct what was effective when work was performed.

Includes:

- additional baseline/amendment versions;
- scope-item lineage across versions;
- source/evidence continuity;
- stale/superseded-basis warnings;
- project commercial history/reconstruction;
- Layer-2 scale, parser recovery and end-to-end hardening.

SC-006 remains the tracking parent and is not itself handed to Codex.

## Priority rationale

1. **SC-006A first** — highest activation and differentiation value; makes Layer 1 commercially useful against a real SOW without waiting for AI/client portal.
2. **SC-006B second** — highest direct revenue/margin-control value; captures the operational moment where agencies currently lose money or negotiate manually.
3. **SC-006C third** — required for mature ongoing engagements, but depends on stable baseline/request/decision semantics and can follow the first usable wedge.

## Measurable Layer-2 outcomes

Validate with customer usage later:

1. PM can import/enter a baseline and link a material existing work item to evidence without AI.
2. PM can identify client-deliverable work lacking commercial provenance before completion.
3. Legitimate technical/admin/support work can avoid false-positive scope warnings without being mislabeled as paid/client scope.
4. A client request can be resolved without forcing a paid change order.
5. Absorbed and swapped work remain explicitly explainable rather than appearing as unexplained margin leakage.
6. A paid change can authorize resulting work while preserving the original baseline and decision evidence.
7. After an amendment, historical work still resolves to the scope/decision effective at the time.
8. All required behavior works in self-host/LAN mode without ScopeDelta Cloud, AI or a paid parsing provider.

## Sources reviewed

### Delivery/request systems

- Linear Customer Requests: https://linear.app/docs/customer-requests
- Linear Salesforce integration: https://linear.app/docs/salesforce
- Jira work-item links: https://support.atlassian.com/jira-cloud-administration/docs/configure-issue-linking/
- Jira Service Management request workflows/forms/approvals: https://support.atlassian.com/jira-service-management-cloud/

### PSA / agency commercial systems

- Productive budget services: https://help.productive.io/en/articles/9330991-adding-services-to-a-budget
- Productive deals → budgets: https://help.productive.io/en/articles/9819347-understanding-the-link-between-deals-and-budgets
- Scoro quotes: https://support.scoro.com/hc/en-us/articles/38466965358861-Getting-started-with-quotes
- Scoro quoted services → tasks: https://support.scoro.com/hc/en-us/articles/12662919591565-Turning-quoted-services-into-tasks
- Scoro quote → project: https://support.scoro.com/hc/en-us/articles/12662893203597-Turning-a-quote-into-a-project
- Kantata snapshots/baselines: https://knowledge.kantata.com/hc/en-us/articles/20367538592667-Project-Snapshots-and-Baselines-Overview
- Kantata budget change orders: https://knowledge.kantata.com/hc/en-us/articles/6618654476827-Project-Admin-Box-Budget-Tab
- Kantata subscribed change-order events: https://knowledge.kantata.com/hc/en-us/articles/4407962435227-Subscribed-Events-Reference

### Requirements traceability

- Perforce Helix ALM requirements management: https://www.perforce.com/products/helix-alm/requirements-management

### Adjacent scope/change products

- ScopeGuard AI agency scope monitoring: https://www.scopeguard.ai/
- Fenscope: https://fenscope.com/
- ScopeAuditor: https://scopeauditor.com/
- Vinrova ScopeTrack: https://www.vinrova.com/scope-management-software

### Document workflow reference

- PandaDoc upload/document format guidance: https://support.pandadoc.com/

## References

- SC-006 / issue #10
- SC-005 / issue #9 / PR #29
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- `docs/ARCHITECTURE.md`
- `docs/research/LAYER1_DELIVERY_CORE_RESEARCH_2026-08.md`
- `docs/decisions/ADR-005-ai-native-client-delivery-os.md`
- RS-002 / issue #21
- Quality follow-up / issue #28 — intentionally separate and non-blocking
