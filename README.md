# ScopeDelta

ScopeDelta is a multi-tenant, self-service client-delivery application for
software agencies and freelancers. This repository contains one portable
Next.js application: the public landing and paid-pilot flow, database-backed
identity, workspace membership administration, audit events, and the initial
authenticated shell.

## Prerequisites

- Node.js 24 LTS (`nvm use` when using nvm).
- pnpm 10.28.2 through Corepack.
- Docker Desktop or another Compose-compatible Docker installation for the
  recommended PostgreSQL and Mailpit development services.

## Fresh-clone setup

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres mailpit
DATABASE_MIGRATION_URL=postgresql://scopedelta:scopedelta_local_only@localhost:5432/scopedelta pnpm db:migrate
pnpm dev
```

Set these local values in `.env.local`:

```dotenv
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://scopedelta:scopedelta_local_only@localhost:5432/scopedelta
DATABASE_MIGRATION_URL=postgresql://scopedelta:scopedelta_local_only@localhost:5432/scopedelta
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=ScopeDelta <no-reply@scopedelta.local>
```

Open [the application](http://localhost:3000) and
[Mailpit](http://localhost:8025). Mailpit captures verification, recovery, and
workspace-invitation messages without sending real email.

Alternatively, run the complete self-host stack—including a one-shot migration
container—with `docker compose up --build`. The credentials in `compose.yaml`
are deliberately local-only and must never be reused in a deployment.

For a team LAN/VPN deployment, expose the application only through a trusted
TLS reverse proxy, set `APP_URL` to that shared origin, and keep PostgreSQL and
SMTP private to the server network. All users and future clients share the same
server-authoritative database and authorization rules; no ScopeDelta Cloud
connection is required for the Layer-0 workspace kernel.

## Environment contract

| Variable                                | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `APP_URL`                               | Canonical HTTPS origin; localhost is the development fallback.       |
| `DATABASE_URL`                          | Pooled PostgreSQL runtime connection.                                |
| `DATABASE_MIGRATION_URL`                | Direct PostgreSQL connection for migrations and operational tooling. |
| `BETTER_AUTH_SECRET`                    | Random server secret, at least 32 characters.                        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Provider-neutral SMTP transport.                                     |
| `SMTP_USER`, `SMTP_PASSWORD`            | Optional SMTP credentials; set both or neither.                      |
| `SMTP_FROM`                             | Verified sender identity.                                            |
| `LEAD_WEBHOOK_URL`                      | Optional paid-pilot receiver.                                        |

All variables above are server-only. Only intentionally public, non-secret
values may use `NEXT_PUBLIC_`. Never expose database URLs, auth secrets, SMTP
credentials, or webhook endpoints with that prefix.

Normal authentication and workspace flows require PostgreSQL and SMTP.
Deployments must set `APP_URL`, both database URLs, `BETTER_AUTH_SECRET`, and the
SMTP variables. The public landing page still renders when platform services
are unavailable. `LEAD_WEBHOOK_URL` is independently required only to accept
paid-pilot submissions.

## Database workflow

The checked-in SQL under `db/migrations/` is immutable deployment history.

```bash
pnpm db:generate       # generate SQL after an approved schema change
pnpm db:check          # validate migration metadata
pnpm db:migrate        # apply pending SQL using DATABASE_MIGRATION_URL
```

Run migrations before application code that depends on them. Never edit an
already deployed migration; add a new migration. Future changes follow
expand/contract sequencing so old and new application versions can overlap.

## Commands

| Command                             | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                          | Start the local development server.                           |
| `pnpm format` / `pnpm format:check` | Write or verify Prettier formatting.                          |
| `pnpm lint`                         | Run ESLint.                                                   |
| `pnpm typecheck`                    | Run strict TypeScript checks.                                 |
| `pnpm test` / `pnpm test:watch`     | Run unit/component tests once or in watch mode.               |
| `pnpm test:integration`             | Run PostgreSQL-backed domain tests using `TEST_DATABASE_URL`. |
| `pnpm test:e2e`                     | Run Chromium flows against PostgreSQL and Mailpit.            |
| `pnpm build` / `pnpm start`         | Build and serve the production application.                   |

## Interfaces and repository conventions

- `src/app/`: App Router pages and `/api/auth/*` plus `/api/v1/*` routes.
- `src/server/`: tenant-aware domain services used by both routes and Server
  Components. Authorization and mutations belong here, not in clients.
- `src/db/`: Drizzle schema and runtime connection.
- `db/migrations/`: checked-in, forward-only SQL migrations.
- `src/components/`: interactive UI; tests use `*.test.tsx` beside the subject.
- `e2e/`: browser journeys; `docs/screenshots/`: reviewed UI evidence.
- `docs/`: architecture decisions and operational runbooks.

Successful ScopeDelta-owned APIs return `{ "data": ... }`; failures return
`{ "error": { "code", "message", "fieldErrors"? } }`. Missing and
cross-tenant resources intentionally share the same 404 response.

Invitation links keep the secret token in the URL fragment. The browser
exchanges it for a short-lived `HttpOnly` cookie before any acceptance request;
do not redesign this token into a query parameter. Audit metadata is allowlisted
and must never contain names, emails, invitation tokens, secrets, or arbitrary
customer content.

Identity pages live at `/sign-up`, `/verification-status`, `/sign-in`,
`/forgot-password`, and `/reset-password`. Verification and reset tokens expire
after one hour; the verification-status destination accepts only same-origin
relative paths.

### Paid-pilot webhook

`POST /api/leads` forwards a validated `pilot_interest.submitted` version `1.0`
event to `LEAD_WEBHOOK_URL`, using the submission UUID as `Idempotency-Key`.
Delivery times out after eight seconds and is not automatically retried. The
application stores no lead data and never logs form contents. The receiver is a
separate privacy and retention boundary; see
[the operations runbook](docs/OPERATIONS.md).

## Deployment

Netlify remains the managed application host. Only the production deploy
context runs `pnpm db:migrate` before `pnpm build`; previews build without
production database credentials. The same runtime can be self-hosted with the
multi-stage `Dockerfile` and Compose stack. PostgreSQL and SMTP are the only
platform protocols—no hosted identity, database, or mail SDK is embedded.

For production configuration, backups, SMTP/DNS, rollback, logging, and TLS,
follow [docs/OPERATIONS.md](docs/OPERATIONS.md). Architecture and security
boundaries are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Troubleshooting

- Wrong pnpm: run `corepack prepare pnpm@10.28.2 --activate`.
- Database connection failures: check `docker compose ps`, the pooled runtime
  URL, and the direct migration URL; then run `pnpm db:migrate`.
- No email: open Mailpit locally or verify production sender DNS, credentials,
  TLS mode, and SMTP egress. Application logs intentionally omit recipients.
- Sign-in redirects back: verify the email first and make sure `APP_URL` exactly
  matches the browser origin.
- Stale generated Next.js types: remove `.next` and rerun `pnpm build`.
- Lead submission unavailable: verify `LEAD_WEBHOOK_URL` independently from the
  platform database and SMTP settings.
