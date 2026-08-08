# ScopeDelta Feature Runtime Matrix

## Status

Planning baseline, updated 2026-08-08 after the Layer-1 delivery-core research checkpoint. Counts are product capabilities, not individual screens or API endpoints. The inventory will be refined before each layer enters engineering.

## Current capability count

- **Total planned capability units: 98**
- **Local/LAN: 55**
- **Hybrid/optional external: 30**
- **External API/service: 5**
- **Managed-cloud only: 4**
- **Desktop client: 4**

The Layer-1 review split the previous combined `Notifications/inbox` capability into a Local/LAN in-app inbox plus an optional Hybrid outbound-email capability. This increases the inventory by one capability and correctly separates software capability from provider delivery.

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

Layer-1 implementation is intentionally split into SC-005A → SC-005B → SC-005C. The product model is client-project-first: `Workspace → Client → Project → Milestone → Work item`, with cycles as an optional project planning overlay.

| Capability | Runtime class | Planned slice |
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
| Optional outbound email notifications | Hybrid/optional external | SC-005C |

Layer-1 has **no mandatory external API or paid service dependency**. The required collaboration loop must work entirely on customer-controlled infrastructure. Optional outbound email can use customer SMTP or a later ScopeDelta-managed email path.

## Layer 2 — Commercial Delivery Graph

| Capability | Runtime class |
|---|---|
| SOW/proposal upload | Local/LAN |
| Text extraction/evidence anchors | Local/LAN |
| Versioned commercial baseline | Local/LAN |
| Requirements/deliverables/exclusions | Local/LAN |
| Client request/change records | Local/LAN |
| Commercial decision taxonomy | Local/LAN |
| Work-to-commercial graph links | Local/LAN |
| Commercial drift detection | Local/LAN |
| Impact fields: effort/schedule/money | Local/LAN |
| Decision/version audit history | Local/LAN |
| Document object storage | Local/LAN |
| Optional OCR for scanned docs | Hybrid/optional external |

## Layer 3 — Client Collaboration & Negotiation

| Capability | Runtime class |
|---|---|
| External client users/invites | Hybrid/optional external |
| Client-safe project portal | Hybrid/optional external |
| Client request intake | Hybrid/optional external |
| Client-safe discussion | Hybrid/optional external |
| Negotiation/change proposal packet | Hybrid/optional external |
| Approve/reject/clarify | Hybrid/optional external |
| Milestone/deliverable acceptance | Hybrid/optional external |
| Immutable shared versions | Local/LAN |
| Email notifications | External API/service |
| Public secure links | Hybrid/optional external |

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
- public email delivery unless the customer supplies SMTP/local mail infrastructure;
- GitHub.com/GitLab.com integration when the customer uses those hosted systems;
- hosted AI when the customer chooses managed inference instead of BYO/local AI;
- optional SSO/directory providers for organizations using external identity systems;
- managed observability/backups for ScopeDelta Cloud.

Everything else should be designed to run on customer-controlled infrastructure when the selected dependencies support it.

## Cost principle

A feature may be included in the self-host/community product even when it is expensive in ScopeDelta Cloud. In that case the self-host customer bears its own compute/storage/inference cost, while ScopeDelta Cloud meters and prices the managed equivalent.

Product entitlements must therefore distinguish **software capability** from **managed-resource allowance**.
