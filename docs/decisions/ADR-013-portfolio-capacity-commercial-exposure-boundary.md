# ADR-013 — Portfolio, capacity, actuals, and commercial-exposure boundary

Status: Accepted
Date: 2026-08-20
Issue: SC-011A / #46

## Context

An agency needs one operating view across concurrent delivery without turning unlike facts into a synthetic health score. Availability is a planning limit, allocation is a forecast, estimates are unscheduled point/count context, and time entries are delivery evidence. The current commercial schema has confirmed effort, schedule, and monetary impacts but no structured baseline monetary amount, staff cost, or exchange-rate authority.

Portfolio access also creates a privacy boundary. A project lead needs enough of a person's overall commitment to avoid over-allocation, but does not gain authority to see unrelated clients, project names, work notes, or delivery-entry detail.

## Decision

1. Operations is a Local/LAN domain. Portfolio, availability, allocation, delivery actuals, and exposure calculations run against the ScopeDelta PostgreSQL core with AI and external integrations disabled.
2. Workspace and member availability are effective-dated ISO-week periods. Existing and new workspaces begin with 2,400 minutes per week. A change begins on the current or a future Monday, closes the preceding period under a row lock, and never rewrites prior weeks.
3. Allocations are explicit Monday-to-Monday weekly forecasts and may overlap. Weekly over-allocation is `max(planned allocation - effective availability, 0)`. No optimizer, leave calendar, partial-day calendar, or estimate-to-hours conversion is introduced.
4. Delivery time is owner-authored evidence on an active accessible project. An optional work item must belong to the same project. Entries retain creator/updater/deleter evidence; deletion is soft and deleted minutes are excluded from aggregates.
5. Owners and admins see and manage workspace operations. Project leads manage led-project allocations and see led-project time detail. Unrelated allocation is exposed only as “Other committed work” with minutes; client/project identifiers, role labels, notes, and entry detail remain hidden. Ordinary members see their own facts and facts already authorized through project access. External participants receive the existing safe not-found boundary.
6. Portfolio attention is transparent and categorical. Every displayed signal links to the relevant existing record/filter; no weighted health score is calculated. Page size is fixed and bounded by validation, and signal/exposure aggregation operates only on the current project page.
7. Commercial exposure uses current authoritative impact, decision, packet-action, baseline-version, and time-entry records. Confirmed impact requires a current authorizing decision and, where the current packet requires approval, an approved current client action. Unresolved, estimated, and approval-pending impact remains pending exposure.
8. Monetary values remain decimal strings grouped by recorded currency. The product shows effective baseline metadata but does not invent baseline money. It does not calculate currency conversion, revenue, cost, profit, or margin. Effort is summed in minutes; schedule effects are counted/listed rather than netted; billable and non-billable actuals remain separate.

## Consequences

- Capacity can identify a planning conflict without disclosing why a person is committed elsewhere.
- Estimates, plans, availability, and actuals remain reconcilable because their labels and storage stay distinct.
- Commercial exposure is intentionally conservative and may show “no baseline value” where another tool would display a fabricated budget or margin.
- More detailed financial reporting requires a later explicit domain decision for baseline amounts, costs, and exchange-rate authority.
- SC-011B/C templates, import/export, onboarding, telemetry, and broader self-service work remain out of scope.

## References

- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- `docs/decisions/ADR-009-client-projection-boundary.md`
- `docs/decisions/ADR-010-engineering-evidence-boundary.md`
