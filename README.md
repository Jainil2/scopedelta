# ScopeDelta

ScopeDelta is a multi-tenant, self-service client-delivery application for
software agencies and freelancers. This repository contains one portable
Next.js application: the public landing and paid-pilot flow, database-backed
identity, workspace membership administration, audit events, client/project
directories, milestones, and a status-grouped production backlog.

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
cp .env.compose.example .env.compose
docker compose --env-file .env.compose up -d postgres mailpit
pnpm db:migrate
pnpm dev
```

Generate a URL-safe local PostgreSQL password and an independent auth secret,
then put the PostgreSQL password in `.env.compose`. Set the matching URLs and
auth secret in `.env.local`; keep every credential blank in committed example
files:

```dotenv
APP_URL=http://localhost:3000
DATABASE_URL=
DATABASE_MIGRATION_URL=
TEST_DATABASE_URL=
BETTER_AUTH_SECRET=
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=ScopeDelta <no-reply@scopedelta.local>
```

`pnpm db:migrate` loads an untracked `.env.local` when present. Browser tests
require `TEST_DATABASE_URL` and `BETTER_AUTH_SECRET`; use a separate disposable
test database. Generate secrets with a password manager or a command such as
`openssl rand -hex 32` and never reuse local values in production.

Open [the application](http://localhost:3000) and
[Mailpit](http://localhost:8025). Mailpit captures verification, recovery, and
workspace-invitation messages without sending real email.

Alternatively, run the complete self-host stack—including a one-shot migration
container—with `docker compose --env-file .env.compose up --build` after filling
the untracked `.env.compose`. The Compose file contains no credential values.

For a team LAN/VPN deployment, expose the application only through a trusted
TLS reverse proxy, set `APP_URL` to that shared origin, and keep PostgreSQL and
SMTP private to the server network. All users and future clients share the same
server-authoritative database and authorization rules; no ScopeDelta Cloud
connection is required for the Layer-0 workspace kernel.

## Environment contract

| Variable                                       | Purpose                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `APP_URL`                                      | Canonical HTTPS origin; localhost is the development fallback.       |
| `DATABASE_URL`                                 | Pooled PostgreSQL runtime connection.                                |
| `DATABASE_MIGRATION_URL`                       | Direct PostgreSQL connection for migrations and operational tooling. |
| `TEST_DATABASE_URL`                            | Disposable PostgreSQL database used only by local/CI tests.          |
| `BETTER_AUTH_SECRET`                           | Random server secret, at least 32 characters.                        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`        | Provider-neutral SMTP transport.                                     |
| `SMTP_USER`, `SMTP_PASSWORD`                   | Optional SMTP credentials; set both or neither.                      |
| `SMTP_FROM`                                    | Verified sender identity.                                            |
| `LEAD_WEBHOOK_URL`                             | Optional paid-pilot receiver.                                        |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`             | Optional read-only GitHub engineering-evidence app identity.         |
| `GITHUB_APP_CLIENT_ID`                         | Optional GitHub user-authorization flow identity.                    |
| `GITHUB_APP_CLIENT_SECRET`                     | Optional server-only GitHub user-authorization secret.               |
| `GITHUB_APP_PRIVATE_KEY`                       | Optional server-only GitHub App signing key.                         |
| `GITHUB_APP_WEBHOOK_SECRET`                    | Optional secret for `/api/v1/integrations/github/webhook`.           |
| `AI_ENABLED`, `AI_PROVIDER`, `AI_MODEL`        | Explicit deployment-wide AI switch, provider, and required model.    |
| `OPENAI_*`, `ANTHROPIC_*`, `GEMINI_*`          | Server-only hosted-provider credentials and optional base URLs.      |
| `OLLAMA_BASE_URL`                              | Explicit local Ollama endpoint; defaults to `127.0.0.1:11434`.       |
| AI limit and timeout variables                 | Context/output/response/concurrency/start limits within hard caps.   |
| `DISTRIBUTION_MODE`                            | `self_host` (default) or explicitly configured `managed_cloud`.      |
| `BILLING_ENTRY_PLAN_KEY`, `BILLING_PLANS_JSON` | Server-only provider-neutral managed plan catalog.                   |
| `MANAGED_AI`, `MANAGED_EMAIL`                  | Whether this deployment supplies and meters managed resources.       |
| `PADDLE_*`                                     | Sandbox API/webhook configuration; live mode is rejected.            |

All variables above are server-only. Only intentionally public, non-secret
values may use `NEXT_PUBLIC_`. Never expose database URLs, auth secrets, SMTP
credentials, or webhook endpoints with that prefix.

Normal authentication and workspace flows require PostgreSQL and SMTP.
Deployments must set `APP_URL`, pooled `DATABASE_URL`, `BETTER_AUTH_SECRET`, and
the SMTP variables in the application host. The privileged
`DATABASE_MIGRATION_URL` belongs only in the GitHub production deployment
workflow's repository secrets or a self-host operator environment—never in
Netlify. The public
landing page still renders when platform services are unavailable.
`LEAD_WEBHOOK_URL` is independently required only to accept paid-pilot
submissions.

When GitHub evidence is enabled, create a read-only GitHub App, configure the
six `GITHUB_APP_*` values, and point its webhook to
`https://<your-host>/api/v1/integrations/github/webhook`. Use explicit
repository grants. Grant read-only repository permissions for metadata, pull
requests, checks and commit statuses, then subscribe to pull request, pull
request review, check run, check suite and status events. ScopeDelta
uses `https://<your-host>/api/v1/integrations/github/callback` as both the App
setup URL and user-authorization callback URL. Keep "Request user authorization
during installation" disabled: ScopeDelta starts that authorization itself
after validating its signed workspace/user setup state, then verifies repository
administrator authority for the exact installation repository through the
resulting user token.
ScopeDelta immediately discards that user token and
stores bounded PR/review/check metadata, not source, diffs, CI logs, webhook
payloads or installation tokens. QA, defects and readiness continue to work
without this optional integration.

### AI delivery intelligence

AI is disabled by default. Set `AI_ENABLED=true`, choose exactly one
`AI_PROVIDER` (`openai`, `anthropic`, `gemini`, or `ollama`), and set an
explicit `AI_MODEL`. Hosted providers also require their matching API key.
ScopeDelta never falls back to a second provider/model.
The normalized provider/model/base-URL route is snapshotted per job and attempt
without API keys. A queued job fails before inference if that route changes or
the runtime AI configuration becomes disabled/invalid; retry explicitly
resnapshots the repaired route.

For local evaluation, install and operate Ollama separately, explicitly obtain
a model, and configure it. A practical development example on a capable Mac is
`gemma3:4b`:

```bash
ollama pull gemma3:4b
```

ScopeDelta never runs that command or downloads a model automatically. When
the app itself runs in Compose and Ollama runs on the host, use
`OLLAMA_BASE_URL=http://host.docker.internal:11434`. Protect any non-loopback
Ollama endpoint as customer-data infrastructure.

`pnpm ai:eval` sends only the checked-in synthetic fixtures to the explicitly
configured provider and validates all three structured result contracts. It is
optional and may incur provider cost for hosted models; normal CI uses mocked
HTTP responses and makes no paid model calls.

### Self-host and managed billing boundary

`DISTRIBUTION_MODE=self_host` is the default. Local/LAN product capability and
BYO/local AI run without a ScopeDelta Cloud phone-home or billing-record
dependency. The Compose example sets this mode explicitly.

Managed-cloud evaluation requires `DISTRIBUTION_MODE=managed_cloud`, an entry
plan key, and a JSON plan catalog. Each catalog entry centralizes a stable plan
key, display copy, optional Paddle sandbox price ID, active-project and optional
internal-user capacities, managed AI/email/storage/processing allowances, and
software capability flags. No public plan name, price, or production allowance
is checked into the repository. The browser return is informational and never
activates an entitlement; only a verified webhook at
`/api/v1/billing/paddle/webhook` reconciles provider state.

Workspace owners can inspect billing and usage under Settings → Billing.
Operators can export bounded, content-free unit-economics evidence with
`pnpm billing:economics`. The export contains workspace IDs, plan/subscription
state, participant/project counts, raw AI usage totals, managed reservations,
email attempt/failure counts, and billing-event exception counts—never document
bodies, email content, or provider payloads.

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
| `pnpm ai:eval`                      | Evaluate all three synthetic jobs on the configured provider. |
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

Netlify remains the managed application host. Merges to `main` trigger the
GitHub `Production deploy` workflow: it applies migrations with a GitHub-only
direct credential, then performs a manual Netlify CLI production
deploy without that credential. `netlify.toml` skips automatic production
builds so application code cannot race ahead of migrations; deploy previews
continue to build without production credentials. The same runtime can be
self-hosted with the multi-stage `Dockerfile` and Compose stack. PostgreSQL and
SMTP are the only runtime protocols—no hosted identity, database, or mail SDK
is embedded.

The managed workflow uses GitHub Actions repository secrets so it works for a
private repository on GitHub Free; it does not provide an environment approval
gate. Netlify CLI authentication is a user-scoped personal access token, not a
site-scoped credential, so minimize that identity's access and use short-lived,
regularly rotated credentials as detailed in `docs/OPERATIONS.md`.

For production configuration, backups, SMTP/DNS, rollback, logging, and TLS,
follow [docs/OPERATIONS.md](docs/OPERATIONS.md). Architecture and security
boundaries are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Troubleshooting

- Wrong pnpm: run `corepack prepare pnpm@10.28.2 --activate`.
- Database connection failures: check
  `docker compose --env-file .env.compose ps`, the pooled runtime URL, and the
  direct migration URL; then run `pnpm db:migrate`.
- No email: open Mailpit locally or verify production sender DNS, credentials,
  TLS mode, and SMTP egress. Application logs intentionally omit recipients.
- Sign-in redirects back: verify the email first and make sure `APP_URL` exactly
  matches the browser origin.
- Stale generated Next.js types: remove `.next` and rerun `pnpm build`.
- Lead submission unavailable: verify `LEAD_WEBHOOK_URL` independently from the
  platform database and SMTP settings.
