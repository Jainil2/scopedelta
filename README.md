# ScopeDelta

ScopeDelta is an AI-assisted scope-change and change-order product for small
software agencies and freelancers. This repository contains the single web
application, paid-pilot interest flow, and durable product and architecture
documentation.

## Prerequisites

- Node.js 24 LTS. Run `nvm use` when using nvm.
- pnpm 10.28.2, managed through Corepack.

## Local setup

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The local application URL
defaults to that address when `APP_URL` is empty.

For production deployments, set `APP_URL` to the canonical absolute URL, such
as `https://app.example.com`. Set `LEAD_WEBHOOK_URL` to the HTTPS endpoint that
will receive paid-pilot applications. An empty webhook value is acceptable for
local UI work, but the form will show a recoverable error until it is configured.
Plain HTTP webhook URLs are accepted only for exact localhost and IP loopback
addresses during local development; non-local HTTP URLs are rejected before any
lead data is forwarded.

Keep webhook URLs and other secrets in the deployment environment or an
untracked `.env.local` file. Variables are server-only unless their names begin
with `NEXT_PUBLIC_`; use that prefix only for values intentionally exposed to
the browser. `LEAD_WEBHOOK_URL` must never use that prefix.

### Lead webhook

`POST /api/leads` validates and normalizes the public form, then sends one JSON
event to `LEAD_WEBHOOK_URL`:

```json
{
  "event": "pilot_interest.submitted",
  "schemaVersion": "1.0",
  "submissionId": "uuid",
  "submittedAt": "2026-08-07T00:00:00.000Z",
  "source": "scopedelta_landing_page",
  "lead": {
    "name": "Alex Rivera",
    "email": "alex@example.com",
    "businessType": "agency",
    "company": "River Studio",
    "scopeChallenge": "A general, non-confidential description"
  }
}
```

The request uses the submission UUID as the `Idempotency-Key` header and sets
`X-ScopeDelta-Event: pilot_interest.submitted`. Delivery has an eight-second
timeout, does not follow redirects, and has no automatic retry; a person
retrying the form reuses the same submission ID. Configure the receiving system
to deduplicate on that ID.

The endpoint is intentionally provider-neutral and stores no lead data in this
application. It caps request bodies, suppresses honeypot submissions, and never
logs form contents. The receiving webhook becomes a separate privacy and data
retention boundary and must be operated accordingly.

## Commands

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `pnpm dev`          | Start the local development server.       |
| `pnpm format`       | Format supported repository files.        |
| `pnpm format:check` | Verify formatting without changing files. |
| `pnpm lint`         | Run ESLint.                               |
| `pnpm typecheck`    | Run strict TypeScript checks.             |
| `pnpm test`         | Run the test suite once.                  |
| `pnpm test:watch`   | Run tests in watch mode.                  |
| `pnpm build`        | Create a production build.                |
| `pnpm start`        | Serve an existing production build.       |

## Repository conventions

- `src/app/` contains application routes, layouts, styles, and route-level UI.
- `src/components/` contains interactive, reusable UI such as the paid-pilot
  form.
- `src/lib/` contains framework-independent validation and interface types.
- Tests are colocated with the code they exercise as `*.test.ts` or
  `*.test.tsx`.
- `src/test/` contains shared test setup.
- `docs/` contains product rules and durable technical decisions.
- Future database migrations belong in `db/migrations/` after a database and
  migration tool are selected by an approved issue.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the selected foundation and
its tradeoffs. Production deployment, verification, lead handling, rollback,
and emergency-disable procedures are in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Production deployment

The SC-003 production target is a founder-controlled Netlify Free project tied
to this GitHub repository, with `main` as the production branch. The checked-in
`netlify.toml` fixes the build command, output directory, Node version, frozen
pnpm installation, and disabled Next.js telemetry. A founder-owned Formspree
form is the initial JSON webhook receiver; it is configured only through the
server-side `LEAD_WEBHOOK_URL` deployment variable.

Deployment is not complete until the public HTTPS page returns 200 and one
synthetic paid-pilot application is visibly received in the Formspree dashboard.
Follow the full [production operations runbook](docs/OPERATIONS.md) for setup,
environment scopes, verification, privacy handling, rollback, and disabling the
site or lead intake. Do not commit the generated site URL as `APP_URL` or the
receiver endpoint as `LEAD_WEBHOOK_URL`; production values belong in Netlify's
environment controls.

## Troubleshooting

- If pnpm reports the wrong version, rerun
  `corepack prepare pnpm@10.28.2 --activate`.
- If generated Next.js types are stale, remove `.next` and rerun `pnpm build`.
- If port 3000 is occupied, start development with `pnpm dev --port 3001` and
  update `APP_URL` accordingly.
- If paid-pilot submissions return a recoverable error, verify that
  `LEAD_WEBHOOK_URL` is configured, reachable from the server runtime, and
  accepts the documented JSON event within eight seconds.
