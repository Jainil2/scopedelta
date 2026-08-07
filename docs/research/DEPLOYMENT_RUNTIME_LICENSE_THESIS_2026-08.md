# ScopeDelta Deployment, Runtime, Desktop & Source-Protection Thesis — August 2026

## Status

CEO research baseline. Exact software license remains a founder/legal decision before any public core-source release.

## Executive conclusion

ScopeDelta should be one product core with multiple deployment/client modes, not separate cloud, local and desktop products.

Recommended architecture:

> **One server-authoritative ScopeDelta core + one shared domain/API model + multiple clients/deployments.**

A team can use the same product through:

1. ScopeDelta Cloud;
2. customer self-hosted server/VPC;
3. company LAN/private-network server;
4. later air-gapped deployment with local replacements for external services;
5. browser client;
6. first-party desktop client connecting to the selected server.

The future desktop client should not own a separate authoritative project database. Core team/project/commercial/audit state remains on the shared server.

## Why server-authoritative local collaboration

For the target 50–500-person customer, a shared server is materially safer and simpler than full peer-to-peer/local-first replication of the project graph:

- one authorization boundary;
- consistent organization/project roles;
- ordered audit history;
- server-side commercial policy enforcement;
- deterministic integration/webhook processing;
- simpler backups and migrations;
- easier client portal access;
- simpler AI/job scheduling;
- fewer conflict-resolution edge cases;
- one source of truth for web and desktop.

This still allows customers to run without ScopeDelta Cloud. A company can install ScopeDelta on a local server/VM and let team members connect over LAN, private DNS, VPN or the organization's existing network controls.

## Desktop strategy

### Recommendation

Do **not** build a separate native desktop product backend.

Build the web product and stable server/API/domain boundary first. After the Layer 1 daily-delivery workflow exists, add a thin first-party desktop client that reuses the frontend/product behavior and adds native capabilities.

Current preferred technology candidate: **Tauri 2**, subject to a fresh technical/security review before implementation.

Reasons:

- supports existing HTML/JavaScript/CSS frontend stacks;
- targets Windows, macOS and Linux;
- uses operating-system webviews rather than bundling a full browser runtime;
- supports native/Rust extensions where desktop integration is actually needed;
- suitable for custom server selection, deep links, native notifications and secure local storage.

Desktop-specific initial value:

- persistent daily workspace;
- server selector for ScopeDelta Cloud/self-host/LAN;
- native deep links;
- native notifications;
- secure token/session material;
- bounded encrypted local cache;
- controlled auto-update for official binaries.

Do not implement full offline collaborative editing/CRDT sync merely to justify having a desktop app.

## Web strategy

Web remains first-class and universal:

- no installation required;
- client portal works naturally in browser;
- self-host and cloud use the same product;
- enterprise customers can put the server behind existing reverse proxies/VPN/SSO controls;
- desktop remains an optional productivity client rather than a requirement.

## Local/LAN team mode

A practical local deployment is:

- one company-controlled Linux server/VM or suitable host;
- ScopeDelta application/API;
- production relational database;
- customer-controlled document/object storage where required;
- optional local SMTP/mail relay;
- optional local AI runtime/OpenAI-compatible endpoint;
- browser/desktop clients on employee machines;
- no ScopeDelta Cloud dependency for Local/LAN-class features.

The customer may expose that server externally through its own secure network architecture when remote employees/clients need access. ScopeDelta should not require a proprietary ScopeDelta relay service for core self-host use.

## Air-gapped/private direction

Air-gapped support is feasible later if every external dependency is represented as a capability adapter instead of hidden core coupling.

In air-gapped mode:

- GitHub.com and other public SaaS integrations are unavailable unless mirrored by an approved local equivalent such as self-hosted GitLab;
- email uses local SMTP or is disabled;
- AI uses local/BYO inference;
- billing is irrelevant to the self-host runtime itself; commercial entitlement may use an offline license mechanism if a paid self-host tier later requires it;
- updates use signed offline packages/manual admin procedures.

Do not promise air-gapped certification/support until Layer 8 hardening validates it.

## Capability runtime result

Current planning inventory: **97 capability units**.

- 54 Local/LAN;
- 30 Hybrid/optional external;
- 5 External API/service;
- 4 Managed-cloud only;
- 4 Desktop-client specific.

See `docs/FEATURE_RUNTIME_MATRIX.md` for the complete inventory.

The implication is that ScopeDelta Cloud should sell **operations and managed resources**, not artificially hold basic project data/workflows hostage.

## What actually needs external APIs/services

The smallest inherently external set is:

- payment/subscription rails for ScopeDelta Cloud;
- GitHub.com integration when GitHub.com is the source system;
- email delivery when a customer does not provide its own mail infrastructure;
- hosted AI when managed inference is selected;
- optional external SSO/directory systems;
- other SaaS integrations customers explicitly connect.

Everything else should have a self-host/local execution path when technically and economically sensible.

## Cloud value proposition

ScopeDelta Cloud should monetize:

- zero-maintenance hosting;
- automated upgrades/migrations;
- managed database/storage;
- backups/recovery;
- managed AI/inference;
- managed email/notifications;
- integration workers/webhook reliability;
- observability/alerts;
- higher limits/performance;
- enterprise governance/support later.

This is stronger than crippling the self-host product because the cloud value remains real even when the software is portable.

## Source-code protection finding

The founder requirement "share enough source/self-host capability to drive adoption, but do not let competitors simply copy the product and sell the same hosted service" conflicts with a fully permissive open-source license.

Under the Open Source Definition, an open-source license cannot prohibit commercial use or a particular field of endeavor. Therefore true open source cannot guarantee that competitors are prevented from commercially operating a fork.

### AGPL

AGPL is strong network copyleft: if somebody modifies an AGPL network server, remote users must be offered the corresponding source of that modified version.

However, AGPL still permits commercial use and competitive hosting when the operator complies. It improves reciprocity; it does **not** satisfy a strict "competitors may not offer a hosted clone" requirement.

### Elastic License 2.0-style source-available model

ELv2 permits use, modification and redistribution while prohibiting providing the product to third parties as a hosted/managed service that exposes a substantial part of its functionality. It also protects license-key functionality and legal notices.

This closely matches the desired free internal self-host + protected first-party cloud model, but it is not OSI open source.

### Business Source License 1.1-style model

BSL keeps source visible. Non-production use is generally allowed, an Additional Use Grant can permit defined production use, and each release eventually converts to a specified open-source Change License by a Change Date/no later than four years under the standard BSL 1.1 terms.

HashiCorp's BSL use demonstrates an Additional Use Grant that allows internal production use while restricting competitive hosted/embedded offerings.

This is another plausible model if eventual true open source is strategically valuable.

### Functional Source License-style model

FSL permits uses other than a defined Competing Use and grants a future open license after a defined period. Sentry currently uses FSL-1.1-Apache-2.0 for self-hosted code, with a future Apache 2.0 grant after two years for each version.

This may fit if we want source visibility and a shorter guaranteed path to open source while protecting the newest versions from direct commercial competition.

## Recommended code boundary

Until legal review:

- keep the main product repository private;
- do not advertise the core as "open source";
- use the term **self-hosted/community** or **source-available** only after exact rights are known;
- plan the core server + first-party web/desktop product for a source-available license allowing internal self-host use but restricting competing managed-service offerings;
- keep public SDKs/API clients/protocol/schema libraries permissive where ecosystem adoption benefits from it;
- reserve the option for enterprise-only modules/services to remain proprietary;
- protect ScopeDelta trademarks separately from source-code copyright/license.

Exact license text requires qualified legal review before publication.

## Security principle

Licensing is not a security mechanism. Assume customers and attackers can inspect client binaries and eventually source. Secrets, authorization, tenant isolation, cryptographic material, billing enforcement and server-side policies must remain secure without relying on obscurity.

A Tauri/native wrapper may make casual reverse engineering harder than shipping raw browser source alone, but this is not meaningful protection against a determined competitor. Legal rights, brand, hosted operations, product velocity, data/network effects and differentiated workflow are the real protection layers.

## Roadmap consequence

- SC-004 continues now and must preserve server-authoritative, self-host/cloud and future desktop compatibility.
- SC-005 builds the useful daily delivery core.
- DX-001 starts only after SC-005 has stabilized the first daily product/API workflow.
- Commercial Delivery Graph remains the primary workflow moat.
- LIC-001 must close before public core-source release.
- RS-002 maintains runtime/cost classification for every future layer.

## Research references

- Tauri 2 architecture and platform documentation: https://v2.tauri.app/start/ and https://v2.tauri.app/concept/architecture/
- Open Source Definition: https://opensource.org/osd
- GNU AGPL v3 / network interaction requirement: https://www.gnu.org/licenses/agpl-3.0.html
- Elastic License 2.0: https://www.elastic.co/licensing/elastic-license
- Business Source License 1.1: https://mariadb.com/bsl11/
- HashiCorp BSL Additional Use Grant example: https://www.hashicorp.com/bsl
- Sentry FSL license example: https://github.com/getsentry/self-hosted/blob/master/LICENSE.md
- OpenProject Community/self-host deployment model: https://www.openproject.org/community-edition/
- Plane self-host developer documentation: https://developers.plane.so/
