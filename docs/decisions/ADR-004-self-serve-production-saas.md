# ADR-004 — Self-Serve Production SaaS Operating Model

## Status

Accepted — founder decision, 2026-08-07.

## Context

ScopeDelta is operated by a solo founder who cannot provide recurring sales calls, concierge onboarding, manual customer support, or human-in-the-loop processing as part of the standard product workflow.

The business must not depend on founder savings to subsidize ongoing cloud, AI, email, storage, or other variable usage. Customers must be able to subscribe and use the product without manual founder intervention, and plan entitlements/usage controls must keep variable costs economically bounded.

The previous Week-1 concierge/paid-pilot strategy is superseded as the primary operating model. Customer research may still inform future decisions, but it must not block construction of the complete self-serve product described here.

## Decision

ScopeDelta will be built as a production-grade, multi-tenant, self-serve SaaS product.

A normal customer journey must not require a founder call or manual backend operation:

1. Discover ScopeDelta.
2. Create an account and workspace.
3. Choose/activate a subscription before unrestricted production usage.
4. Create clients/projects.
5. Provide the agreed scope/SOW.
6. Have ScopeDelta structure the agreed scope with traceable source evidence.
7. Submit a new client request.
8. Receive an AI-assisted, cited scope-impact analysis.
9. Review/edit the commercial decision.
10. Generate a professional change order.
11. Send a client-facing approval link.
12. Receive approve/reject/clarification status with an audit trail.
13. See current change requests, approvals, and commercial impact in the application.
14. Manage subscription/account lifecycle without founder intervention.

## Product operating constraints

- Standard onboarding must be self-service.
- Standard support should be in-product/documentation-driven; founder intervention is exception-only.
- No concierge processing is required for normal product value delivery.
- Tenant data must be isolated at every read/write boundary.
- Customer documents and generated commercial records must have explicit secure storage and access controls.
- AI conclusions must cite source scope items/evidence and remain editable before client communication.
- Expensive/variable operations must be metered and governed by plan entitlements, limits, and abuse controls.
- Background or failure-prone work must have appropriate retry/idempotency/recovery behavior.
- The system must provide enough observability to diagnose production failures without inspecting customer content unnecessarily.
- Subscription state must control product entitlements automatically.
- Customer account cancellation/deletion and data-retention behavior must be defined before general availability.
- The architecture should scale through managed/reversible infrastructure without requiring proportional founder operations.

## Meaning of “enterprise-grade” for the initial product

For ScopeDelta, enterprise-grade means production reliability, security boundaries, auditable workflows, scalability, recoverability, and operational discipline.

It does **not** mean building enterprise procurement features before demand exists. The initial release does not require SAML/SSO, SCIM, on-premise deployment, custom SLAs, complex enterprise RBAC, procurement workflows, or a large integration marketplace unless future evidence justifies them.

## Commercial constraint

ScopeDelta will use recurring subscription revenue as the normal commercial model. Exact public subscription pricing and live payment-provider activation remain founder decisions before general availability.

Engineering may build provider-compatible subscription/entitlement infrastructure before the final public price is selected, using test/sandbox configuration and centrally configurable plan definitions.

## Consequences

- Engineering resumes immediately; the prior outreach gate no longer blocks the product roadmap.
- No new engineering should optimize for a concierge-only workflow.
- The release gate is an end-to-end self-serve paid workflow, not a landing-page or pilot demo.
- Product scope should remain narrow around scope-change management while the implementation quality is production-grade.

## References

- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/BUSINESS_RULES.md`
- `docs/ARCHITECTURE.md`
