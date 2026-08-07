# ScopeDelta Application Architecture

## Status

Accepted for SC-001. Revisit this decision only when validated product needs or
an approved issue require a material architectural change.

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
Next.js can run on a standard Node.js host or a compatible serverless platform;
the repository does not select or provision a hosting vendor.

## Repository layout

- `src/app/`: routes, layouts, route-level components, and styles.
- `src/test/`: shared test environment setup.
- `*.test.ts` and `*.test.tsx`: tests colocated with their subject.
- `docs/`: durable product and engineering decisions.
- `db/migrations/`: reserved for future immutable migrations after an approved
  issue selects a database and migration tool. The directory is not created
  until then.

Reusable UI may move to `src/components/` and framework-independent logic to
`src/lib/` when real implementation requires them. These directories are not
created speculatively.

## Quality and delivery

- Prettier defines repository formatting.
- ESLint uses the Next.js Core Web Vitals and TypeScript rules.
- TypeScript runs in strict, no-emit mode.
- Vitest, jsdom, and React Testing Library provide colocated component and unit
  tests.
- Pull-request CI installs the locked dependency graph and runs formatting,
  linting, type checking, tests, and the production build on Node.js 24.

The committed `pnpm-lock.yaml`, pinned package-manager version, and `.nvmrc`
keep local worktrees and CI reproducible.

## Environment and security boundaries

`APP_URL` is the canonical absolute application URL. Local development falls
back to `http://localhost:3000`; production deployments must set the real URL.
The `.env.example` file contains variable names without credentials.

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
- Component tests give fast confidence in the bootstrap. End-to-end browser
  tests are deferred until user workflows exist and justify their maintenance
  and runtime cost.
- No database or hosting vendor is selected. This preserves reversibility but
  leaves those deployment decisions to later validated requirements.
