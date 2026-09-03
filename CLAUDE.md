# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read these first

- `AGENTS.md` — issue sizing, review/merge protocol, definition of done, safety boundaries. It governs process; follow it.
- `README.md` — setup, the full environment-variable contract, command table.
- `docs/ARCHITECTURE.md` — authoritative per-feature design and security boundaries, keyed to migration numbers.
- `docs/QUALITY_GATES.md` — which checks run on ordinary PRs vs. the `merge-candidate` final gate.

## Commands

Node 24, pnpm 10.28.2 via Corepack. PostgreSQL + Mailpit come from `docker compose --env-file .env.compose up -d postgres mailpit`.

```bash
pnpm typecheck                                          # tsc --noEmit (strict)
pnpm lint                                               # eslint (next core-web-vitals + typescript)
pnpm format:check                                       # prettier
pnpm test                                               # jsdom unit/component suite
pnpm test src/lib/utils.test.ts                         # one unit file
pnpm test -t "workspace slug"                           # one test by name
pnpm test:integration                                   # PostgreSQL domain suite
pnpm test:integration src/server/workspaces.integration.test.ts
pnpm test:e2e --grep "sign in"                          # Playwright, Chromium only
pnpm test:ga                                            # scale/query-plan proof (slow, final gate only)
pnpm db:generate && pnpm db:check && pnpm db:migrate
pnpm production:validate                                # deployment config guard
pnpm desktop:rust:test / :clippy / :check                # native Tauri suite (cargo --locked)
```

Operator/evidence scripts run through `tsx` with `--conditions=react-server`: `pnpm operations:signals`, `operations:alerts`, `lifecycle:process`, `billing:economics` (bounded, content-free exports), `webmcp:demo`, and `ai:eval` — which calls the real configured provider and can cost money on a hosted model.

Test-file routing is by filename: `*.integration.test.ts` → `vitest.integration.config.ts` (node env, `fileParallelism: false`), `*.ga.test.ts` → `vitest.ga.config.ts`, everything else → `vitest.config.ts` (jsdom, which excludes the other two plus `e2e/**`). Unit and component tests live beside their subject.

Integration tests hard-fail unless `TEST_DATABASE_URL` names a database ending in `scopedelta_test` — a deliberate guard against truncating a real database, since the suites `truncate`/`delete` tables in `beforeEach`. Playwright additionally requires `BETTER_AUTH_SECRET` and boots its own server on port 3100 with a stub Ollama endpoint.

Both non-jsdom configs alias `server-only` to `src/test/server-only.ts`, so importing a `src/server/*` module in a test does not trip Next's compile-time server boundary.

## Architecture

One portable Next.js 16 App Router application (React Server Components by default) on Node 24, PostgreSQL via Drizzle, generic SMTP, Better Auth. No proprietary runtime SDK. The same artifact serves the landing page, auth, the versioned API, and the authenticated UI, and runs on Netlify or from the checked-in `Dockerfile`.

**The layering rule is the load-bearing invariant:** every mutation and every authorization decision lives in `src/server/*`. Route handlers under `src/app/api/` are protocol adapters, Server Components are read adapters, and both call the same service functions. Client components never authorize anything — visibility is convenience only.

A route handler is therefore always this shape (see `src/app/api/v1/workspaces/[workspaceId]/clients/route.ts`):

```ts
const actor = await requireApiActor(request); // src/server/api-auth.ts
const input = parseInput(schema, await readJson(request)); // src/lib/*-validation.ts
return apiData(await someService(actor, workspaceId, input), 201);
// catch → apiError(error)
```

Server Components get the same actor through the `react`-`cache`d helpers in `src/server/request-context.ts` (`getRequestIdentity`, `getRequestWorkspace`, `getRequestProject`).

That shape is mechanically enforced: `src/server/api-route-contract.test.ts` walks every `route.ts` under `src/app/api/v1`, and any file exporting `POST`/`PUT`/`PATCH`/`DELETE` must call `requireApiActor(`, or match the invitation boundary (`requireSameOrigin` + `verify*InvitationToken`), or be one of two hard-coded signed-provider webhooks (Paddle, GitHub). A new mutating route without one of those fails `pnpm test`; adding an exception means editing that allowlist, which is a review decision, not a fix.

### Authorization boundaries

Three deliberately separate boundaries, all enforced in the service layer:

1. **Workspace membership** (`owner`/`admin`/`member`, active status) — checked before any tenant read or write.
2. **Project access** — owners/admins reach every project; a `member` needs an explicit `project_memberships` row. Primitives are in `src/server/delivery.ts`: `getProjectAccess`, `assertWritableProject` (also rejects non-active projects), `assertProjectManager`/`isProjectManager` (workspace owner/admin or project lead).
3. **External client participation** — an active `client_project_participants` row only; never workspace membership. The client-facing surface is an explicit allowlist DTO in `src/lib/client-project-projection.ts`, not a filtered internal object, so internal backlog/estimates/AI/Git/QA data cannot leak by inheritance.

A missing resource and a cross-tenant resource both return the same 404 (`notFound()` from `src/lib/platform-errors.ts`). Preserve that indistinguishability. `EntitlementPolicy` (`src/lib/entitlements.ts`) is consulted _after_ authorization for the same reason.

### Contracts to keep

- Responses: `{ data }` on success, `{ error: { code, message, fieldErrors? } }` on failure. `PlatformError` carries code + status; anything else becomes a 503 logged as the fixed string `platform_api_unavailable`. Never surface database or provider detail.
- `readJson` caps bodies (16 KB default). Pagination defaults to 50, caps at 100.
- Environment variables are read only through `src/lib/env.ts` helpers, which validate and throw `platform_*_unconfigured`. All config is server-only; `NEXT_PUBLIC_` is reserved for deliberately public values.
- Audit events (`audit_events`) are append-only with versioned `*.v1` event types and **allowlisted metadata**: IDs, enums, and changed field names only — never names, emails, tokens, or customer content. Tests assert this. Operational logs use fixed non-PII event names for the same reason.
- `db/migrations/` is immutable deployment history. Add a new migration; never edit a deployed one. Runtime uses pooled `DATABASE_URL`, migrations use direct `DATABASE_MIGRATION_URL`. Schema changes follow expand/contract.
- Invitation secrets travel in the URL fragment and are exchanged for a short-lived `HttpOnly` cookie before acceptance. Do not turn them into query parameters.
- `next.config.ts` sets `Permissions-Policy: tools=(self)` plus `Origin-Agent-Cluster` globally (WebMCP), and `private, no-store` + `noindex` + `no-referrer` + frame denial on `/app`, `/client`, `/api/v1`, and the identity pages.

### WebMCP layer

`src/webmcp.ts` registers browser-side MCP tools on `navigator.modelContext`; `src/webmcp/workflow-catalog.ts` describes each workflow as a fixed route/method plus **the same Zod schema the API route validates with**. Agent input never supplies a URL or HTTP method, and registrations are document-owned so remounts cancel stale work. There is no backend agent identity and no second auth path — tools ride the signed-in session. Native browsers cap total registered tools, so workflows load on demand via `discover_workflows.load` (commit `d2502f9`); adding tools to the eagerly registered set can break real browsers even though the UI badge still counts them.

### AI layer

AI is off unless `AI_ENABLED=true` with exactly one `AI_PROVIDER` and an explicit `AI_MODEL`. `src/lib/ai/contracts.ts` holds the Zod result contracts; the JSON Schema sent to the provider is derived from them and every response is re-validated (including citations) afterwards. `src/server/ai/provider.ts` has plain `fetch` adapters for OpenAI/Anthropic/Gemini/Ollama — no vendor SDK — and normalizes tokens, duration, request ID, and refusals without logging provider bodies.

PostgreSQL is the queue: `src/server/ai/jobs.ts` writes a job, then Next's `after()` claims it under a lease. A job snapshots a provider/model/base-URL fingerprint (never the API key) plus a context fingerprint, and execution aborts before any provider call if either drifted. There is no automatic retry and no provider fallback — an expired lease or changed route becomes a failed job needing explicit retry, so nothing can double-spend or silently move customer data to another processor.

### Desktop client

Tauri 2.11 (`src-tauri/`, bundled UI in `desktop/`). The bundled selector is trusted; the remote product WebView is not. Remote pages get exactly two commands (`remote_notification_context`, `remote_submit_notifications`), each re-verifying window label and exact origin. Deep links accept only `scopedelta://open?server=<origin>&path=<allowlisted route>`. Notifications are content-free by construction. Details and the rationale are in `docs/DESKTOP_OPERATIONS.md`.

## Working expectations

- Prefer extending an existing `src/server/*` service and its `src/lib/*-validation.ts` schema over introducing a new abstraction; the codebase deliberately runs on PostgreSQL + SMTP with no queue, cache, object store, or graph database.
- Ordinary PRs only get typecheck + unit + migrate + integration. Formatting, lint, `db:check`, `test:ga`, production build, smoke, container build, and restore proof run only on the `merge-candidate` label — so run the focused ones locally before claiming a change is clean.
- `docs/` is durable state: update `ARCHITECTURE.md` when a boundary moves, and the relevant ADR under `docs/decisions/` when a decision changes.
