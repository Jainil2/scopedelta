# ScopeDelta Application Architecture

## Status

Accepted for SC-001 and extended by SC-002 and SC-003. Revisit these decisions
only when validated product needs or an approved issue require a material
architectural change.

## Context and goals

ScopeDelta needs a low-cost foundation that one developer can run locally and
ship quickly for paid-pilot validation. The initial repository contained only
product documentation. Authentication, persistence, AI analysis, billing, and
client approval workflows are intentionally outside this foundation.

## Decision

ScopeDelta is a single Next.js 16.2 application using the App Router, React
19.2, strict TypeScript, Node.js 24 LTS, and pnpm. Routes and server-rendered UI
live together under `src/app`; React Server Components remain the default, and
client components should be introduced only for browser interaction.

This structure provides server rendering, metadata, route handling, and a
production build without adding a separate API service or paid infrastructure.
Next.js can run on a standard Node.js host or a compatible serverless platform.
SC-003 selects Netlify Free as the first production host because it supports the
application's App Router and Node route-handler needs, permits commercial
projects on the free plan, and imposes a hard usage limit without automatic
overage charges. GitHub-connected production deploys follow `main`; the
checked-in `netlify.toml` keeps the build contract reviewable and portable.

## Repository layout

- `src/app/`: routes, layouts, route-level components, and styles.
- `src/test/`: shared test environment setup.
- `*.test.ts` and `*.test.tsx`: tests colocated with their subject.
- `docs/`: durable product and engineering decisions.
- `db/migrations/`: reserved for future immutable migrations after an approved
  issue selects a database and migration tool. The directory is not created
  until then.

Reusable interactive UI lives in `src/components/`; framework-independent
validation and interface types live in `src/lib/`.

## Paid-pilot lead boundary

SC-002 adds one narrow write boundary: `POST /api/leads`. The browser submits a
UUID, name, email, business type, optional company name, general scope challenge,
and hidden honeypot. Shared validation normalizes the human fields, while the
server caps the JSON body at 16 KiB and returns stable response codes for field
validation, oversized payloads, unavailable configuration, and upstream
failure.

Valid human submissions are forwarded to the server-only `LEAD_WEBHOOK_URL` as
a `pilot_interest.submitted` event with schema version `1.0`. The request uses
the submission UUID as its idempotency key, times out after eight seconds, and
is not automatically retried. The browser retains that UUID and all entered
fields after a failure, so a deliberate user retry remains deduplicatable. A
filled honeypot returns success without forwarding.

Webhook transport requires HTTPS for every non-local receiver. Plain HTTP is
accepted only for exact localhost, IPv4 loopback addresses in `127.0.0.0/8`, or
IPv6 `::1` during local development. Other HTTP configurations are treated as
unavailable before any lead data leaves the application. Webhook requests do
not follow redirects, preventing a permitted URL from downgrading or changing
the transport destination.

This adapter remains provider-neutral. SC-003 configures a founder-owned
Formspree form as the initial production receiver because it accepts the
existing JSON event without application-specific client credentials or a new
database. Formspree is an operational deployment choice, not a domain
dependency: its URL is supplied only through `LEAD_WEBHOOK_URL`, and no SDK or
provider type enters application code. The deployment owner secures the
receiver, applies retention controls, and deduplicates submissions. The
application never logs lead payloads or returns receiving-provider details to
the browser.

## Quality and delivery

- Prettier defines repository formatting.
- ESLint uses the Next.js Core Web Vitals and TypeScript rules.
- TypeScript runs in strict, no-emit mode.
- Vitest, jsdom, and React Testing Library provide colocated component and unit
  tests.
- Pull-request CI installs the locked dependency graph and runs formatting,
  linting, type checking, tests, and the production build on Node.js 24.
- Netlify installs the frozen pnpm graph, builds the same Next.js artifact on
  Node.js 24, and publishes merged `main` commits as production deploys.

The committed `pnpm-lock.yaml`, pinned package-manager version, and `.nvmrc`
keep local worktrees and CI reproducible.

## Environment and security boundaries

`APP_URL` is the canonical absolute application URL. Local development falls
back to `http://localhost:3000`; production deployments must set the real URL.
`LEAD_WEBHOOK_URL` is required in deployments that accept paid-pilot
applications; without it, the form safely preserves input and reports a
recoverable error. The `.env.example` file contains variable names without
credentials.

The production values live in Netlify's Production deploy context. The
Formspree endpoint is treated as secret operational configuration because
direct disclosure would bypass ScopeDelta's server validation and honeypot.
Netlify build and function logs must not contain lead request or webhook bodies.
Detailed deployment, verification, lead-retention, rollback, and disable
procedures live in `docs/OPERATIONS.md`.

Environment variables are server-only by default. A `NEXT_PUBLIC_` prefix is
reserved for values deliberately exposed in browser bundles. Secrets, customer
contracts, and customer content must never be committed, logged, or used as
public fixtures. Future tenant-scoped features must enforce organization
isolation at every read and mutation boundary.

## Tradeoffs

- A single application minimizes deployment and coordination overhead, but it
  couples UI and server routes in one release unit. That is appropriate for the
  current team and MVP scope.
- Next.js introduces framework conventions and a Node.js runtime dependency,
  but supplies the routing, rendering, metadata, and build capabilities needed
  for the planned product without bespoke infrastructure.
- Component tests give fast confidence in the landing-page behavior. Browser
  automation verifies the primary responsive conversion flow without adding a
  persistent end-to-end suite yet.
- No database or product data store is selected. This preserves reversibility
  and leaves persistence decisions to later validated requirements. Netlify is
  the selected validation host, but the standard Next.js build and
  provider-free application boundary keep a future host move practical.
- Webhook delivery avoids persistence and provider coupling, but availability
  depends on the configured receiver. The stable event and idempotency key keep
  a future adapter or durable queue possible without introducing one early.
- Netlify Free and Formspree Free minimize launch cost and prohibit surprise
  infrastructure spend, but they introduce external usage limits and a manual
  lead-review workflow. A paid plan, durable queue, CRM, or database requires a
  separate approved issue and founder approval where it creates spend.
