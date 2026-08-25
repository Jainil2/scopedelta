# ScopeDelta Feature Runtime Matrix

## Status

Planning baseline, updated 2026-08-25 for the SC-012 general-availability hardening and production-risk-closure boundary. Counts are product capabilities, not individual screens or API endpoints. The inventory is refined before each layer enters engineering.

## Current capability count

- **Total planned capability units: 98**
- **Local/LAN: 65**
- **Hybrid/optional external: 21**
- **External API/service: 4**
- **Managed-cloud only: 4**
- **Desktop client: 4**

The Layer-3 review reclassifies the core client portal/request/approval capabilities from Hybrid to Local/LAN. Client identity, project-safe projection, request intake, commercial packet publication/actions and delivery acceptance are all server-authoritative ScopeDelta behavior and do not inherently require ScopeDelta Cloud or another SaaS provider. Outbound email is Hybrid/optional external: ScopeDelta Cloud may manage it while self-host customers can supply SMTP/local mail infrastructure or distribute invitation/action links manually.

Layer 3 therefore introduces **no mandatory paid external service dependency**. Layer 4 preserves that local core for QA, defects, traceability and readiness; the implemented GitHub evidence connection is an explicitly selected external provider dependency. GitLab remains deferred and classified Hybrid because a future adapter could target self-hosted or hosted GitLab.

Layer 5 is complete through SC-009 / PR #43. Layer 6 preserves the distinction between software capability and ScopeDelta-managed resources: self-host core operation is Local/LAN and does not call cloud billing, while hosted checkout/portal/lifecycle inherently use an external payment service. Active-project/internal-user rules and managed usage accounting remain provider-neutral local domain behavior. External client participants remain separate from internal-user capacity. Layer 7 is delivered through SC-011A/B/C: portfolio operations, templates, generic/Jira CSV migration, bounded core export, onboarding/admin/recovery, lifecycle intent, and local signal storage/export are Local/LAN with no mandatory AI or external-provider dependency.

Layer 8 is refined by the SC-012 research checkpoint as **GA risk closure, not enterprise checkbox parity**. Required work proves and hardens existing product/runtime boundaries, adds bounded operator attention where needed, exercises recovery and representative scale, and produces durable GA evidence. SSO/SAML, SCIM, arbitrary/custom RBAC, managed multi-region/data-residency, certification work, and irreversible physical deletion are not SC-012 implementation requirements. Managed alert delivery may use an external/provider path, but self-host remains operable with deployment-local signals and no ScopeDelta Cloud telemetry phone-home. Physical purge remains founder/legal-gated and out of scope until an approved retention policy exists.

### Runtime meaning

- **Local/LAN:** can run against a customer-controlled ScopeDelta server and local infrastructure without ScopeDelta Cloud.
- **Hybrid/optional external:** core state/workflow can remain local, but the feature may call a customer-selected local service or an external provider for enhanced behavior, for example local vs hosted AI, self-hosted GitLab vs GitHub.com, local SMTP vs managed email.
- **External API/service:** the named capability is inherently about an outside system/provider and cannot exist meaningfully without that external system.
- **Managed-cloud only:** operational convenience sold by ScopeDelta Cloud; self-hosted users supply their own equivalent infrastructure.
- **Desktop client:** client-side capability; it connects to the same ScopeDelta server/API as the web client.

## Deployment conclusion

The authoritative team state should live in one shared ScopeDelta server per deployment, not in independent per-user desktop databases. A 50–500-person customer can run that server in ScopeDelta Cloud, on its own server/VPC, or on a LAN/private network. Web browsers and future desktop clients connect to that same server.

This avoids fragile peer-to-peer conflict resolution for core project/commercial/audit state while still allowing a desktop client to keep a small encrypted local cache for UX/offline-read improvements later.

## Layer counts

| Layer | Capability units |
|---|---:|
| Layer 0 — Platform Kernel | 9 |
| Layer 1 — Delivery Core | 16 |
| Layer 2 — Commercial Delivery Graph | 12 |
| Layer 3 — Client Collaboration & Negotiation | 10 |
| Layer 4 — Engineering & QA Delivery Loop | 9 |
| Layer 5 — AI-Native Delivery Intelligence | 11 |
| Layer 6 — Cloud Economics & Distribution | 9 |
| Layer 7 — Portfolio & Self-Service Scale | 9 |
| Layer 8 — GA Hardening & Production Risk Closure | 8 |
| Cross-cutting — Desktop Client | 5 |

## Layer 0 — Platform Kernel

| Capability | Runtime class |
|---|---|
| Account signup/sign-in/recovery | Local/LAN |
| Organizations/workspaces | Local/LAN |
| Membership + roles | Local/LAN |
| Tenant isolation/authorization | Local/LAN |
| Database + migrations | Local/LAN |
| Audit/event log | Local/LAN |
| API/service boundary | Local/LAN |
| Feature/entitlement hooks | Local/LAN |
| Self-host configuration/backup basics | Local/LAN |

## Layer 1 — Delivery Core

Layer 1 is complete through SC-005A → SC-005B → SC-005C. The product model is client-project-first: `Workspace → Client → Project → Milestone → Work item`, with cycles as an optional project planning overlay.

| Capability | Runtime class | Delivered slice |
|---|---|---|
| Clients/engagements | Local/LAN | SC-005A |
| Projects | Local/LAN | SC-005A |
| Milestones/releases | Local/LAN | SC-005A |
| Work items | Local/LAN | SC-005A |
| Subtasks | Local/LAN | SC-005A |
| Dependencies | Local/LAN | SC-005A |
| Acceptance criteria | Local/LAN | SC-005A |
| Assignments/priority/estimates | Local/LAN | SC-005A |
| List/backlog view | Local/LAN | SC-005A |
| Cycles/sprints | Local/LAN | SC-005B |
| Board view | Local/LAN | SC-005B |
| Search/filtering + personal work views | Local/LAN | SC-005B |
| Comments/activity | Local/LAN | SC-005C |
| Project/spec notes | Local/LAN | SC-005C |
| In-app notifications/inbox | Local/LAN | SC-005C |
| Optional outbound email notifications | Hybrid/optional external | Deferred |

Layer 1 has **no mandatory external API or paid service dependency**.

## Layer 2 — Commercial Delivery Graph

Layer 2 is complete through SC-006A → SC-006B → SC-006C. See `docs/research/LAYER2_COMMERCIAL_DELIVERY_GRAPH_RESEARCH_2026-08.md`.

| Capability | Runtime class | Delivered slice |
|---|---|---|
| Commercial evidence ingestion: paste + text-PDF + DOCX | Local/LAN | SC-006A |
| Deterministic text extraction + evidence anchors | Local/LAN | SC-006A |
| Versioned commercial baseline foundation | Local/LAN | SC-006A + SC-006C |
| Evidence-backed scope items: deliverable/requirement/exclusion/constraint | Local/LAN | SC-006A |
| Work-purpose classification | Local/LAN | SC-006A |
| Work-to-commercial basis links | Local/LAN | SC-006A + SC-006B |
| Advisory commercial drift detection | Local/LAN | SC-006A + SC-006C |
| Client request records/lifecycle | Local/LAN | SC-006B |
| Commercial decision ledger/taxonomy | Local/LAN | SC-006B |
| Impact fields: effort/schedule/money | Local/LAN | SC-006B |
| Amendment/version lineage + reconstruction history | Local/LAN | SC-006C |
| Optional OCR for scanned/image documents | Hybrid/optional external | Deferred; not required by SC-006A/B/C |

Layer-2 runtime rules:

- Required Layer-2 product behavior runs on the same customer-controlled server-authoritative core; there is no mandatory ScopeDelta Cloud call.
- No mandatory AI/model API, hosted document parser, OCR provider, e-signature service, CRM or billing provider.
- Private source storage has both a customer-controlled persistent path and a managed-cloud-compatible persistent path.
- PDF/DOCX parsing is deterministic infrastructure, not semantic AI extraction. Human users curate scope items and evidence anchors.
- Scanned/image OCR remains deferred until customer evidence justifies the runtime/operational dependency.
- Customer commercial documents and request bodies must not be copied into ordinary logs/audit metadata.

## Layer 3 — Client Collaboration & Negotiation

Layer 3 is complete. See `docs/research/LAYER3_CLIENT_COLLABORATION_RESEARCH_2026-08.md`.

The validated architecture is **one commercial truth, two projections**: internal delivery users operate the authoritative project/Commercial Delivery Graph, while external clients receive a deliberately smaller project/request/decision/acceptance projection from the same server-side records.

| Capability | Runtime class | Delivered slice |
|---|---|---|
| External client users/invites | Local/LAN | SC-007 |
| Client-safe project portal | Local/LAN | SC-007 |
| Client request intake | Local/LAN | SC-007 |
| Client-safe discussion | Local/LAN | SC-007 |
| Negotiation/change proposal packet | Local/LAN | SC-007 |
| Approve/reject/clarify | Local/LAN | SC-007 |
| Milestone/deliverable acceptance | Local/LAN | SC-007 |
| Immutable shared versions | Local/LAN | SC-007 |
| Outbound email notifications | Hybrid/optional external | SC-007; optional provider/SMTP |
| Public/action links | Local/LAN | Token generation local; broad unauthenticated portal deferred |

Layer-3 runtime rules:

- Ongoing client access uses project-scoped authenticated external participants on the same ScopeDelta server.
- Invitation/action token generation is local server behavior. Self-host deployments without outbound mail can expose copyable invitation/action URLs to authorized internal users.
- ScopeDelta Cloud may provide managed outbound email; self-host deployments can configure SMTP/local mail infrastructure.
- Email delivery failure never invalidates or rolls back authoritative request, publication, approval or acceptance state.
- Client participants are not normal internal employee seats; exact hosted pricing/limits remain a later SC-010/founder decision.
- No mandatory e-signature, CRM, billing, document-hosting or other paid provider is introduced by Layer 3.

## Layer 4 — Engineering & QA Delivery Loop

Layer 4 is complete through SC-008 / PR #41. See `docs/research/LAYER4_ENGINEERING_QA_DELIVERY_LOOP_RESEARCH_2026-08.md`.

| Capability | Runtime class | Delivered slice |
|---|---|---|
| GitHub repository integration | External API/service | SC-008; read-only GitHub App, signed tenant/user setup state, GitHub user-verified repository-admin grant |
| GitLab integration | Hybrid/optional external | Deferred; provider boundary only |
| Branch/commit/PR links | Hybrid/optional external | SC-008 implements PR/head metadata and local manual/auto work links |
| CI/check status | Hybrid/optional external | SC-008 stores provider-reported rollups; ScopeDelta does not execute CI |
| Webhook reconciliation | Hybrid/optional external | SC-008 signed/deduplicated delivery plus bounded reconciliation |
| Defect/bug model | Local/LAN | SC-008 |
| QA verification/checklists | Local/LAN | SC-008 lightweight verification records; no test-management suite |
| Requirement/test coverage | Local/LAN | SC-008 factual evidence gaps and trace drill-down |
| Release readiness | Local/LAN | SC-008 factual project/milestone gap aggregation; no score |

Layer-4 runtime rules:

- Local/LAN QA verification, defects, evidence trace and readiness operate without GitHub.
- GitHub metadata is fetched only after signed ScopeDelta setup state and GitHub user authorization prove repository-admin authority for an explicitly installed and granted repository; user/installation tokens and source/code/diff/log content are not persisted.
- Provider outage, revocation or disconnect preserves historical evidence and surfaces staleness.
- GitLab is not implemented by SC-008. Its Hybrid classification preserves the distinction between future self-hosted GitLab and GitLab.com.
- Layer-4 records are strictly internal and are not added to the SC-007 client-safe projection.

## Layer 5 — AI-Native Delivery Intelligence

Layer 5 is complete through SC-009 / PR #43. See
`docs/research/LAYER5_AI_NATIVE_DELIVERY_INTELLIGENCE_RESEARCH_2026-08.md` and
`docs/decisions/ADR-011-ai-provider-data-and-action-boundary.md`.

| Capability | Runtime class | Delivered slice |
|---|---|---|
| AI provider abstraction | Hybrid/optional external | SC-009; exactly one snapshotted deployment provider/model/base-URL route, fail closed on drift, no fallback |
| Local/BYO model support | Local/LAN | SC-009; explicit Ollama endpoint/model, no automatic download |
| Requirement/work-item generation | Hybrid/optional external | SC-009; previewed backlog/unclassified drafts only |
| Commercial/scope reasoning | Hybrid/optional external | SC-009 Scope Change Analyst with citations and uncertainty |
| PM backlog hygiene | Hybrid/optional external |
| Dependency/risk/replanning assistant | Hybrid/optional external | SC-009 Delivery Risk Brief; facts remain server-authored |
| Developer context assistant | Hybrid/optional external | SC-009 Work Context & QA Pack |
| QA test/risk assistant | Hybrid/optional external | SC-009 cited draft test scenarios |
| Client-safe AI summaries | Hybrid/optional external |
| Bounded AI actions/agents | Hybrid/optional external | SC-009 human-confirmed work and internal clarification drafts |
| AI evals/usage/cost controls | Local/LAN | SC-009 durable usage, limits, synthetic fixtures, provider-neutral runner |

## Layer 6 — Cloud Economics & Distribution

Layer-6 research is complete and SC-010 is implemented for review. See
`docs/research/LAYER6_CLOUD_ECONOMICS_DISTRIBUTION_RESEARCH_2026-08.md`,
`docs/SELF_HOST.md`, and
`docs/decisions/ADR-012-billing-entitlement-resource-boundary.md`.

| Capability | Runtime class | Delivered slice |
|---|---|---|
| Self-host installer/package | Local/LAN | SC-010 shared image/Compose plus production upgrade/backup runbook; no cloud phone-home |
| Managed cloud deployment | Managed-cloud only | Existing managed artifact/runtime; live provider activation remains founder-gated |
| Cloud tenant provisioning | Managed-cloud only | Entry entitlement initialized with workspace; broader infrastructure provisioning deferred |
| Subscription checkout | External API/service | SC-010 Paddle sandbox hosted transaction checkout; browser return non-authoritative |
| Billing webhooks/lifecycle | External API/service | SC-010 raw-body signature, dedupe/order reconciliation, grace/cancel/expiry |
| Hosted billing portal | External API/service | SC-010 temporary Paddle customer-portal session |
| Usage metering/entitlements | Local/LAN | SC-010 provider-neutral plan snapshots, project/member guards, AI/email usage ledger |
| Managed backups/observability | Managed-cloud only | Existing backup/deploy operations plus bounded billing/usage exception evidence |
| Managed email/AI/storage allowances | Managed-cloud only | SC-010 AI reservation and email attempt enforcement; storage/processing dimensions retained without speculative infrastructure |

Layer-6 runtime rules:

- `DISTRIBUTION_MODE=self_host` is the default. Local/LAN and BYO/local AI never require a ScopeDelta Cloud billing row or remote entitlement check.
- Managed-cloud plan names, prices, provider price IDs, and allowances are server configuration rather than source constants.
- External client participants do not consume optional internal-user capacity.
- Active project creation/reactivation and internal invitation acceptance are workspace-serialized.
- Managed AI reserves before provider execution; raw token/model/duration evidence remains separate from vendor price tables.
- Managed email counts provider attempts; self-host/customer SMTP does not consume a ScopeDelta-managed allowance.
- Live payment activation and public source/license distribution remain founder/legal gates.

## Layer 7 — Portfolio & Self-Service Scale

| Capability | Runtime class | Delivered slice |
|---|---|---|
| Portfolio attention with evidence drill-down | Local/LAN | SC-011A; categorical signals, no health score |
| Capacity/workload + delivery actuals | Local/LAN | SC-011A; effective availability, allocation, and owner-authored actuals stay distinct; estimates remain point/count context |
| Conservative commercial exposure | Local/LAN | SC-011A; currency-grouped confirmed/pending impact and actual effort, no margin |
| Project/workflow templates | Local/LAN | SC-011B; versioned definitions and copied application snapshots, no workflow builder |
| CSV import/export | Local/LAN | SC-011B; durable preview/confirm plus formula-neutralized bounded core delivery export |
| Jira migration/import | Local/LAN | SC-011B Jira CSV preset; direct API/OAuth deferred |
| Admin/member management | Local/LAN | SC-011C; suspension/reactivation, bounded directory filters, invitation reissue/manual links |
| Guided onboarding/help | Local/LAN | SC-011C; authoritative derived completion plus per-admin dismiss/resume |
| Privacy-safe product telemetry | Local/LAN | SC-011C local bounded signal storage/operator export; outbound transport/alerts deferred |

## Layer 8 — GA Hardening & Production Risk Closure

SC-012 is a hardening/proof layer over the product already implemented in Layers 0–7. It does not add enterprise identity/governance breadth without customer evidence.

| Capability | Runtime class |
|---|---|
| Production-like lifecycle proof across Layers 0–7 | Local/LAN |
| Tenant/project/client authorization + application security hardening | Local/LAN |
| Async/provider recovery and reconciliation | Hybrid/optional external |
| Privacy-safe operator attention/alerting | Hybrid/optional external |
| Backup/restore/export/non-destructive lifecycle processing | Local/LAN |
| Managed-resource/abuse containment | Hybrid/optional external |
| Representative 50–500-person scale verification | Local/LAN |
| GA operations/readiness evidence package | Local/LAN |

Layer-8 runtime rules:

- Core hardening, authorization, backup/restore verification, open-format export, non-destructive lifecycle processing, scale evidence, and deployment-local operational evidence must work on customer-controlled infrastructure.
- Provider-backed recovery/containment remains optional by provider: GitHub, billing, hosted AI, and outbound email retain their existing runtime classes rather than becoming mandatory dependencies.
- Managed cloud may add a bounded external alert-delivery path, but self-host must remain operable with no ScopeDelta Cloud telemetry phone-home.
- SSO/OIDC/SAML, SCIM/directory provisioning, arbitrary/custom RBAC/policy builders, managed multi-region/data-residency, certification work, and customer-managed encryption keys are deferred enterprise capabilities, not SC-012 prerequisites.
- Physical purge, legal retention periods, Terms/Privacy/DPA wording, and irreversible deletion policy remain founder/legal gates. SC-012 records and processes lifecycle intent non-destructively and must fail closed on purge until policy approval.

## Cross-cutting — Desktop Client

| Capability | Runtime class |
|---|---|
| Desktop shell Windows/macOS/Linux | Desktop client |
| Custom server URL / LAN connection | Desktop client |
| Native notifications/deep links | Desktop client |
| Local encrypted cache | Desktop client |
| Auto-update channel | Hybrid/optional external |

## External dependency inventory

The initial plan should minimize mandatory paid external dependencies. The unavoidable provider-dependent areas are:

- payment/subscription rails for ScopeDelta Cloud;
- outbound email delivery when ScopeDelta Cloud or a customer chooses an external mail provider, while self-host may use local SMTP/manual link delivery;
- GitHub.com/GitLab.com integration when the customer uses those hosted systems;
- hosted AI when the customer chooses managed inference instead of BYO/local AI;
- future optional SSO/directory providers if customer evidence later justifies enterprise identity integrations; these are outside SC-012;
- managed observability/backups/storage for ScopeDelta Cloud.

Commercial document parsing, the Commercial Delivery Graph, Layer-3 client project/request/approval/acceptance state, Layer-4 local QA/defect/readiness state, and SC-012 core GA hardening/proof are deliberately **not** added to this unavoidable-external list. They must work on customer-controlled infrastructure.

## Cost principle

A feature may be included in the self-host/community product even when it is expensive in ScopeDelta Cloud. In that case the self-host customer bears its own compute/storage/inference cost, while ScopeDelta Cloud meters and prices the managed equivalent.

Product entitlements must therefore distinguish **software capability** from **managed-resource allowance**.
