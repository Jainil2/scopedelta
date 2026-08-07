# ADR-006 — Self-host, source visibility, and desktop/offline policy

## Status

Accepted — founder decision, 2026-08-07.

## Context

ScopeDelta is being built as an AI-native client software delivery operating system for 50–500-person software service organizations. The product must support low-cost adoption, customer-controlled deployment, a managed cloud business, a future first-party desktop client, and protection against direct hosted-service cloning.

Three distribution/runtime choices materially affect the architecture and roadmap:

1. whether the desktop client must support full offline collaborative editing;
2. whether organizations can use the self-hosted core without software-license fees;
3. whether the product source should eventually be visible to customers/community.

## Decisions

### 1. No full offline collaborative editing initially

ScopeDelta will **not** build full offline multi-user editing/synchronization as an initial product requirement.

The authoritative organization/project/commercial/audit state remains on one ScopeDelta server per deployment. Web and desktop clients connect to that server.

The desktop client may later support:

- encrypted local cache;
- fast startup/read behavior;
- bounded offline-read capability;
- queued/retryable client actions only where correctness is clear.

It will not initially require a general-purpose peer-to-peer/CRDT conflict-resolution system for the entire delivery graph.

### 2. Free internal self-hosted core

Organizations, including companies in the primary 50–500-person ICP, may use the permitted self-hosted core for their own internal/company production use without a software-license fee, subject to the exact source-available license selected under LIC-001.

Self-hosted customers provide and pay for their own infrastructure, operations, storage, email, AI/inference and external-provider costs where applicable.

ScopeDelta Cloud monetizes managed operational value rather than intentionally disabling local-capable product logic.

### 3. Source-visible after protected-license decision

The ScopeDelta core should become source-visible after LIC-001 selects and legally validates an appropriate protected source-available license and package boundary.

Until that gate closes:

- the core repository remains private;
- product documentation must not promise an OSI-open-source license;
- public release must not use a permissive license that enables unrestricted hosted-service cloning contrary to the founder strategy.

Public SDKs, API clients, protocol/schema packages and integration examples may use more permissive licenses when ecosystem adoption justifies it.

## Consequences

- Server-authoritative collaboration remains the architecture for cloud, VPC/self-host and LAN deployments.
- DX-001 must not add full offline write/sync as a release requirement.
- Self-host/local capability and ScopeDelta-managed resource allowance must remain separate entitlement concepts.
- The product should remain usable on customer-controlled infrastructure without ScopeDelta Cloud for Local/LAN-class capabilities.
- Managed cloud should compete on convenience, reliability, managed AI, updates, backups, notifications, observability and operational limits.
- LIC-001 remains a founder/legal gate before any public core-source release.
- Security cannot depend on source secrecy; tenant isolation, authorization, cryptography, secrets and billing/provider trust boundaries must remain sound if source is visible.

## References

- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- `docs/decisions/ADR-005-ai-native-client-delivery-os.md`
- `docs/research/DEPLOYMENT_RUNTIME_LICENSE_THESIS_2026-08.md`
- ARCH-001 / issue #20
- DX-001 / issue #18
- LIC-001 / issue #19
