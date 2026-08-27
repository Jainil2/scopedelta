# ScopeDelta desktop operations

## Status and authority

DX-001 is a private cross-platform beta. The desktop executable is a client of
an existing ScopeDelta deployment; it does not host a ScopeDelta backend. Better
Auth sessions, `/api/v1/*`, authorization decisions, notifications, and all
project/commercial records remain authoritative on the selected server and its
PostgreSQL database.

Public signing/notarization, paid OS certificates, app stores, and artifact or
update publication require founder approval. The checked-in workflows only
prepare private artifacts.

## Supported targets

- Windows x64: NSIS installer using the standard WebView2 bootstrapper.
- Windows x64 offline: separate NSIS flavor embedding the WebView2 offline
  installer.
- macOS universal: Apple Silicon + Intel app/DMG, macOS 12 or newer.
- Linux x64: AppImage and deb on the Ubuntu 22.04 / Debian 12 WebKitGTK 4.1
  baseline.

The shared identity is `com.scopedelta.desktop`, custom scheme is
`scopedelta`, and beta versioning begins at `0.1.0`.

## Local development

Install Node.js from `.nvmrc`, pnpm 10.28.2, Rust 1.98.0 with `rustfmt` and
`clippy`, and the platform Tauri prerequisites. Then run:

```bash
pnpm install --frozen-lockfile
pnpm desktop:web:build
cargo test --locked --manifest-path src-tauri/Cargo.toml
pnpm desktop:dev
```

Debug builds accept `http://localhost` and `http://127.0.0.1` servers.
All other HTTP remains rejected. Release builds accept HTTPS only.
The selected server must expose:

- unauthenticated `GET /api/v1/desktop/bootstrap`;
- authenticated `GET /api/v1/desktop/notifications`;
- the existing Better Auth and product routes.

`SCOPEDELTA_CLOUD_ORIGIN` optionally pre-fills the selector. It is build
configuration, not a credential.

## Server selection and switching

The native verifier normalizes an origin, rejects paths/credentials/query/
fragments, disables redirects, uses platform TLS verification, and requires the
bootstrap response to identify ScopeDelta protocol version 1 with the same
canonical origin. DNS, VPN, timeout, certificate, protocol, redirect, and
canonical-origin failures leave the current deployment untouched.

Changing deployments is destructive only to local WebView browsing state. The
app verifies the new server, calls the system WebView's full browsing-data
clear, resets notification cursor/dedupe state, then atomically saves the new
origin. Cookies, cache, DOM storage, IndexedDB, and service-worker data are not
copied between deployments. Users sign in again on the new server.

Native preference storage contains:

- selected canonical server origin;
- notification opt-in and opaque server cursor;
- bounded notification event IDs for dedupe;
- Tauri window-state plugin data.

Passwords, Better Auth cookies, access tokens, project records, commercial
content, provider payloads, code, and AI content are never written to native
preference storage.

## Deep links and navigation

The registered shape is:

```text
scopedelta://open?server=<origin>&path=<relative-route>
```

Only enumerated workspace inbox/project/work-item/client routes are accepted.
Fragments, credentials, traversal, encoded separators, duplicate/extra query
parameters, arbitrary URLs, unsupported identifiers, and production HTTP
origins fail closed. Links for the active deployment focus and reuse the
existing instance. Cross-deployment links return to the trusted selector and
require explicit verification and confirmation before clearing state.

Same-origin product navigation stays in the WebView. Only HTTPS GitHub and
Paddle provider hosts in the Rust allowlist may open through the OS. Unknown
off-origin navigation is blocked.

## Notifications

Notifications are opt-in and poll only while the app is active/visible. The
native permission prompt is initiated from the bundled preferences UI. Denial,
later OS revocation, an offline server, or a polling error is non-fatal and does
not block the web product.

The first poll establishes a server watermark without showing historical
alerts. Later polls page forward with a bounded opaque cursor. Server
authorization is re-evaluated on every request, including active workspace
membership, member project assignment, and active client participation.
Suspension or participant revocation immediately removes future events.

Event responses and native alerts are content-free. They contain only a
bounded ID, generic category, creation timestamp, and allowlisted relative
route. OS notification title/body text is fixed by the native app.
Notification activation revalidates that route and opens it only if the event's
deployment is still selected; a server switch makes an older alert inert.

## Update configuration and private release preparation

Missing update configuration disables update checks. Update-enabled builds
require all of:

```text
SCOPEDELTA_DESKTOP_UPDATES_REQUIRED=1
SCOPEDELTA_DESKTOP_UPDATER_ENDPOINT=https://updates.example/...
SCOPEDELTA_DESKTOP_UPDATER_PUBLIC_KEY=<minisign public key contents>
TAURI_SIGNING_PRIVATE_KEY=<private key contents or CI-supported value>
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<when the key is encrypted>
```

The build script fails an update-required build when the endpoint, public key,
or private key is absent. The updater accepts only HTTPS configuration, verifies
Tauri update signatures, and rejects using the selected customer deployment as
the updater origin. Malformed metadata, transport failure, and invalid
signatures fail closed.

Run the `Prepare signed desktop release` workflow with an exact reviewed
40-character SHA. It builds signed updater artifacts on the three operating
systems, writes SHA-256 manifests, and uploads private short-retention workflow
artifacts. It does not create a GitHub release or publish an update manifest.

Run the manual `Desktop` workflow with an exact reviewed 40-character SHA when
desktop evidence is wanted. Every invocation builds the selector, runs
TypeScript and Rust format/lint/type/test checks, checks the locked malicious-
crate denylist, runs the RustSec advisory audit and Windows preference test, and
builds standard Windows, offline-WebView2 Windows, macOS universal, and Linux
installer evidence. It never runs automatically for pull requests or merge
candidates and is not a required merge check.

## Troubleshooting

- **Server unavailable:** verify VPN/DNS first, then open the bootstrap endpoint
  in a normal browser. Do not bypass TLS or add a certificate-ignore switch.
- **Certificate rejected:** repair the server certificate chain or managed
  device trust configuration. Production builds have no insecure override.
- **Bootstrap redirect rejected:** configure the selected canonical origin
  directly; redirects and HTTPS downgrades are intentionally forbidden.
- **No notification shown:** confirm the desktop preference and OS permission.
  The web app should continue normally if permission is denied.
- **Wrong deployment after a link:** decline the switch. Cross-deployment links
  never silently replace the selected server.
- **Update check unavailable:** confirm build-time endpoint/public-key inputs.
  Customer server configuration cannot enable or redirect the updater.
