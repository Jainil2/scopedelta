# ScopeDelta Feature Runtime Matrix

## Status

Planning baseline, updated 2026-08-10 after the Layer-3 Client Collaboration & Negotiation research checkpoint. Counts are product capabilities, not individual screens or API endpoints. The inventory is refined before each layer enters engineering.

## Current capability count

- **Total planned capability units: 98**
- **Local/LAN: 63**
- **Hybrid/optional external: 23**
- **External API/service: 4**
- **Managed-cloud only: 4**
- **Desktop client: 4**

The Layer-3 review reclassifies the core client portal/request/approval capabilities from Hybrid to Local/LAN. Client identity, project-safe projection, request intake, commercial packet publication/actions and delivery acceptance are all server-authoritative ScopeDelta behavior and do not inherently require ScopeDelta Cloud or another SaaS provider. Outbound email is Hybrid/optional external: ScopeDelta Cloud may manage it while self-host customers can supply SMTP/local mail infrastructure or distribute invitation/action links manually.

Layer 3 therefore introduces **no mandatory paid external service dependency**.

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
| Layer 8 — Enterprise / GA Hardening | 8 |
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

Layer-3 research is complete. See `docs/research/LAYER3_CLIENT_COLLABORATION_RESEARCH_2026-08.md`.

The validated architecture is **one commercial truth, two projections**: internal delivery users operate the authoritative project/Commercial Delivery Graph, while external clients receive a deliberately smaller project/request/decision/acceptance projection from the same server-side records.

| Capability | Runtime class | Planned slice |
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

| Capability | Runtime class |
|---|---|
| GitHub repository integration | External API/service |
| GitLab integration | Hybrid/optional external |
| Branch/commit/PR links | Hybrid/optional external |
| CI/check status | Hybrid/optional external |
| Webhook reconciliation | Hybrid/optional external |
| Defect/bug model | Local/LAN |
| QA verification/checklists | Local/LAN |
| Requirement/test coverage | Local/LAN |
| Release readiness | Local/LAN |

## Layer 5 — AI-Native Delivery Intelligence

| Capability | Runtime class |
|---|---|
| AI provider abstraction | Hybrid/optional external |
| Local/BYO model support | Local/LAN |
| Requirement/work-item generation | Hybrid/optional external |
| Commercial/scope reasoning | Hybrid/optional external |
| PM backlog hygiene | Hybrid/optional external |
| Dependency/risk/replanning assistant | Hybrid/optional external |
| Developer context assistant | Hybrid/optional external |
| QA test/risk assistant | Hybrid/optional external |
| Client-safe AI summaries | Hybrid/optional external |
| Bounded AI actions/agents | Hybrid/optional external |
| AI evals/usage/cost controls | Local/LAN |

## Layer 6 — Cloud Economics & Distribution

| Capability | Runtime class |
|---|---|
| Self-host installer/package | Local/LAN |
| Managed cloud deployment | Managed-cloud only |
| Cloud tenant provisioning | Managed-cloud only |
| Subscription checkout | External API/service |
| Billing webhooks/lifecycle | External API/service |
| Hosted billing portal | External API/service |
| Usage metering/entitlements | Local/LAN |
| Managed backups/observability | Managed-cloud only |
| Managed email/AI/storage allowances | Managed-cloud only |

## Layer 7 — Portfolio & Self-Service Scale

| Capability | Runtime class |
|---|---|
| Portfolio/project health | Local/LAN |
| Capacity/workload | Local/LAN |
| Budget/margin visibility | Local/LAN |
| Project/workflow templates | Local/LAN |
| CSV import/export | Local/LAN |
| Jira migration/import | Hybrid/optional external |
| Admin/member management | Local/LAN |
| Guided onboarding/help | Local/LAN |
| Privacy-safe product telemetry | Hybrid/optional external |

## Layer 8 — Enterprise / GA Hardening

| Capability | Runtime class |
|---|---|
| SSO/OIDC/SAML | Hybrid/optional external |
| SCIM/directory lifecycle | Hybrid/optional external |
| Advanced RBAC/policies | Local/LAN |
| Audit export/retention | Local/LAN |
| Data export/deletion | Local/LAN |
| Backups/disaster recovery | Hybrid/optional external |
| Observability/alerting | Hybrid/optional external |
| Load/security/GA hardening | Local/LAN |

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
- optional SSO/directory providers for organizations using external identity systems;
- managed observability/backups/storage for ScopeDelta Cloud.

Commercial document parsing, the Commercial Delivery Graph, and Layer-3 client project/request/approval/acceptance state are deliberately **not** added to this unavoidable-external list. They must work on customer-controlled infrastructure.

## Cost principle

A feature may be included in the self-host/community product even when it is expensive in ScopeDelta Cloud. In that case the self-host customer bears its own compute/storage/inference cost, while ScopeDelta Cloud meters and prices the managed equivalent.

Product entitlements must therefore distinguish **software capability** from **managed-resource allowance**.
