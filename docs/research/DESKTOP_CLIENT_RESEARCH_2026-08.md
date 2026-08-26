# ScopeDelta Desktop Client Research — August 2026

## Status

**Research checkpoint complete 2026-08-26.** DX-001 / #18 is ready for engineering as the next cross-cutting client task after SC-012.

## Product conclusion

ScopeDelta should ship a thin first-party desktop client over the existing server-authoritative product. The desktop client is an adoption/retention surface for daily use and private-network workflows; it is not a new product backend, not the Commercial Delivery Graph moat, and not a reason to duplicate product logic.

The authoritative topology remains:

`Desktop/Web client → selected ScopeDelta server → shared domain/API rules → PostgreSQL`

The initial desktop release must not introduce an authoritative per-device project database, peer-to-peer replication, or full offline collaborative writes.

## Repository state reviewed

The post-SC-012 repository confirms:

- one Next.js 16.2 App Router application serves authenticated UI, Better Auth and `/api/v1/*`;
- PostgreSQL remains the system of record;
- authorization is enforced in server-side services shared by UI/API paths;
- managed cloud and self-host/LAN deployments use the same product core;
- production self-host requires a canonical HTTPS origin behind a maintained TLS reverse proxy;
- the architecture already reserves a future first-party desktop client over the same server/domain rules;
- SC-012 provides GA hardening, authorization evidence, backup/restore/export/recovery and representative scale proof without changing that topology.

Relevant repository references:

- `docs/ARCHITECTURE.md`
- `docs/SELF_HOST.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- `docs/GA_READINESS.md`
- `docs/decisions/ADR-006-self-host-source-visible-desktop-policy.md`
- `docs/research/DEPLOYMENT_RUNTIME_LICENSE_THESIS_2026-08.md`

## Desktop framework review

### Tauri 2 remains the preferred candidate

Tauri 2 still fits the product boundary well:

- Windows/macOS/Linux desktop support;
- operating-system WebViews rather than bundling a full browser runtime;
- explicit native capability/ACL model;
- supported deep-link plugin;
- supported notification plugin;
- signed updater model;
- conventional platform installers and CI support.

Current upstream documentation reviewed:

- https://v2.tauri.app/security/
- https://v2.tauri.app/security/capabilities/
- https://v2.tauri.app/security/csp/
- https://v2.tauri.app/release/
- https://v2.tauri.app/release/tauri/v2.11.1/
- https://v2.tauri.app/plugin/deep-linking/
- https://v2.tauri.app/plugin/notification/
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/distribute/

As of the checkpoint, the Tauri release index reports the 2.11.x line as current stable production tooling, with core 2.11.5 published July 2026. Codex should select a currently supported patched release at implementation time rather than pinning to the old August 2026 planning baseline mechanically.

### Security finding: remote content is the critical boundary

The primary desktop risk is not Tauri-versus-Electron branding; it is rendering a remotely served, customer-selectable ScopeDelta origin inside a process that can also reach native OS capabilities.

Tauri's capability model blocks remote frontend access to native APIs by default and requires explicit remote grants. This is important because the desktop client must support customer-controlled server origins that are not known when the binary is built.

Tauri 2.11.1 also included material remote-origin security fixes: remote IPC/custom commands are subject to ACL resolution, and a local-origin classification bug was corrected. Therefore DX-001 must use a patched supported Tauri 2 baseline and must not grant broad native permissions to arbitrary remote pages.

Product security requirement:

> Rendering a ScopeDelta server inside the desktop application must not implicitly grant that server, redirected external content, or a compromised page broad filesystem, shell/process, clipboard, updater, URL-launch or other native-machine privileges.

Any native bridge must be narrowly scoped to a real product requirement and validate the active selected ScopeDelta server/origin plus the requested action semantics.

Codex may choose another desktop framework if it finds a concrete implementation/security blocker, but that framework must satisfy the same boundary.

## Initial desktop product scope

### Required value

1. Persistent first-party desktop workspace.
2. Explicit server selection for ScopeDelta Cloud and customer-controlled HTTPS ScopeDelta servers.
3. Safe authentication/session behavior using the existing server authority.
4. Validated desktop deep links.
5. Opt-in OS notifications for bounded ScopeDelta events while the app is active.
6. Deployment-isolated local settings/state.
7. Cross-platform build/release pipeline and a cryptographically verified official-update path.
8. Manual/offline installation/update path for private-network customers.

### Deliberate simplification

Do not build a broad encrypted project cache in the initial release merely because desktop storage exists. Persist only what is needed for connection preference, window state and similarly non-authoritative UX state unless engineering proves a concrete need.

If sensitive local material is required, it must use OS-appropriate secure storage/encryption and have explicit clear/isolation behavior on logout and server switching.

Background push or a resident daemon while the application is fully closed is not required for the first desktop beta. That avoids creating a new provider, long-lived credential or background-runtime dependency before customer evidence justifies it.

## Server selection and transport

Production self-host already requires canonical HTTPS. The desktop client should therefore use the same production contract rather than inventing a parallel insecure-LAN mode.

Requirements:

- accept valid ScopeDelta HTTPS origins;
- keep loopback/insecure exceptions development-only where existing runtime rules allow them;
- fail safely on malformed URLs, TLS certificate failures and hostname mismatch;
- never silently downgrade HTTPS;
- no ScopeDelta Cloud relay/phone-home is required for Local/LAN product behavior;
- switching deployment must isolate or clear prior authenticated browsing/session/cache state.

A customer with no outbound internet but with access to its private ScopeDelta server must still be able to use the product, excluding intentionally external providers and official auto-update checks.

## Authentication/session boundary

The desktop client should preserve Better Auth and the current server-side authorization model rather than creating a second token system.

Do not persist user passwords. Do not extract and duplicate server session cookies into a second long-lived desktop credential store unless implementation evidence proves it necessary and the security implications are reviewed.

Existing server-side session revocation, password reset, workspace suspension/removal, project membership and client participant rules must continue to control access from desktop.

## Deep links

Tauri's desktop deep-link support is suitable, but its documentation explicitly notes that users can manually forge a deep-link invocation. ScopeDelta must therefore treat a deep link as untrusted input.

Initial deep links should resolve only to validated ScopeDelta application routes or stable record identifiers on the currently selected deployment. A deep link must never become an arbitrary executable command or unrestricted external URL.

A link that refers to another deployment must not silently switch authenticated server context. Server changes require an explicit safe flow.

## Notifications

Tauri exposes desktop notifications with OS permission controls. ScopeDelta should keep the initial payload privacy-conservative.

Do not place commercial document bodies, request/comment text, source/code/diff content, AI prompts/results, secrets or raw provider payloads into OS notification payloads. Notification actions should navigate through the same validated ScopeDelta deep-link/route boundary.

## Release/update boundary

Tauri's updater verifies signed update artifacts and its signature verification cannot be disabled. This is appropriate for official ScopeDelta binaries.

The engineering task should prepare:

- cross-platform build jobs;
- versioned release artifacts;
- update-signature verification configuration;
- secret placeholders/documentation rather than committed private keys;
- manual/offline install/update path for private environments.

Public distribution introduces separate founder gates:

- macOS public distribution requires Apple code signing/notarization;
- Windows signing is needed for normal trust/reputation and store distribution;
- paid signing accounts/certificates/services are material expenditure decisions;
- app-store publication is an irreversible external release action.

DX-001 implementation should be ready for these credentials but must not purchase or publish without founder approval.

## Runtime/cost classification

The existing feature/runtime matrix remains directionally correct:

- desktop shell — Desktop client;
- custom server/LAN connection — Desktop client;
- native notifications/deep links — Desktop client;
- bounded local settings/cache — Desktop client;
- official auto-update — Hybrid/optional external.

No mandatory paid external provider is introduced merely to run the desktop client against a self-hosted ScopeDelta server. Public signing/notarization and hosted update distribution are release/operations choices, not core product runtime dependencies.

## Engineering handoff

DX-001 / #18 is the executable specification. Engineering should default to one coherent desktop-beta PR and split only for a concrete review-safety, platform-signing/release, authorization-boundary or dependency reason under `AGENTS.md`.

The key review questions are:

1. Does desktop reuse the existing authoritative product rather than creating a fork?
2. Can cloud and customer HTTPS servers be selected safely?
3. Is authenticated state isolated on server switching?
4. Can any remote or redirected page gain unintended native privileges?
5. Are deep links treated as untrusted input?
6. Are notification payloads privacy-safe?
7. Can private/self-host customers install/update manually without ScopeDelta Cloud?
8. Are production signing/updater secrets absent from source?

## Out of scope

- full offline collaboration;
- CRDT/peer-to-peer synchronization;
- authoritative local project/commercial database;
- mobile-native applications;
- arbitrary native plugin marketplace;
- generic filesystem/shell/process capability from the product UI;
- app-store publication as an engineering acceptance criterion;
- public core-source release/license selection;
- enterprise MDM/SSO/SCIM packaging without customer evidence.
