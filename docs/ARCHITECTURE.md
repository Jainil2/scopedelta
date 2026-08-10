# ScopeDelta Application Architecture

## Status

Implemented through SC-006B. The SC-004 production platform kernel now supports
the client-project delivery foundation plus production board, optional cycle
planning, authorized cross-project daily execution, and internal project
collaboration. SC-006A adds the first evidence-backed commercial baseline and
advisory work provenance. SC-006B adds atomic client requests, explicit
commercial decisions and impact history, plus decision-backed work provenance;
baseline amendment lineage remains in SC-006C.

## System decision

ScopeDelta remains one Next.js 16.2 App Router application on Node.js 24. React
Server Components are the default; client components are limited to interactive
forms and navigation. The same artifact serves the landing page, Better Auth,
ScopeDelta APIs, and authenticated workspace UI. It can run through Netlify's
Next.js adapter or as the checked-in production container.

PostgreSQL is the durable system of record. Drizzle supplies the typed schema
and forward-only SQL migrations. Better Auth uses the same database for users,
credentials, verification tokens, sessions, and authentication rate limits.
Generic SMTP carries verification, password-recovery, and invitation mail.
None of these boundaries depend on a proprietary runtime SDK.

The collaborative source of truth remains one server-side PostgreSQL database
per deployment. Managed cloud, customer-controlled LAN/VPN deployments, future
web clients, and a future first-party desktop client use the same versioned API
and server domain rules. SC-004 does not add per-device project databases,
peer-to-peer synchronization, or full offline collaborative writes.

```text
Browser
  ├─ public page + POST /api/leads ──> provider-neutral lead webhook
  └─ Next.js UI/API
       ├─ /api/auth/* ───────────────> Better Auth
       ├─ /api/v1/* ────────────────> tenant-aware domain services
       ├─ Server Components ─────────> the same domain services
       ├─ node-postgres/Drizzle ─────> PostgreSQL
       └─ Next after() + Nodemailer ─> SMTP
```

## Persistence and migrations

Runtime connections use pooled `DATABASE_URL`. Schema migration, backup, and
restore operations use direct `DATABASE_MIGRATION_URL`; transaction/session
semantics required by schema tools must not traverse a transaction pooler.
`db/migrations/` is immutable deployment history. A GitHub production
workflow applies pending migrations, then manually deploys the Netlify build.
The direct credential is scoped only to the migration step and is neither
stored in Netlify nor inherited by application Functions. Automatic Netlify
production builds are skipped to preserve this ordering; previews never receive
production database credentials and therefore only build.

Initial migrations are additive. Future changes use expand/contract:

1. expand with nullable/new structures compatible with the current release;
2. deploy code that writes both shapes or backfills safely;
3. move reads to the new shape and verify;
4. contract only in a later release after old code cannot run.

Rollback is by forward fix. Restoring older application code is safe only while
its schema contract remains supported.

## Identity and session security

Better Auth provides email/password identity with verified-email signup,
one-hour verification and reset tokens, database-backed seven-day sliding
sessions, database-backed rate limits, and session revocation after password
reset. Cookie caching is disabled, so every protected server read validates the
database session. Better Auth retains origin/CSRF checks. Production cookies
are `Secure`, `HttpOnly`, and `SameSite=Lax`.

ScopeDelta-owned session-cookie mutations additionally require an exact
same-origin `Origin` header, including the unauthenticated fragment-token
staging exchange.

Authentication responses avoid disclosing whether an account exists. Email
delivery is scheduled with Next.js `after()` so request timing does not depend
on SMTP. Delivery errors log only the fixed event
`platform_email_delivery_failed`; recipients, tokens, message bodies, and
provider responses are excluded.

Signup verification returns through `/verification-status`; its continuation
target is restricted to a same-origin relative path before it is rendered.

## Tenant model and authorization

A user may belong to multiple workspaces. Every workspace has settings and at
least one owner membership. The initial settings timezone is `UTC`; updates
accept valid IANA timezone names without geographic assumptions. Stable slugs
derive from workspace names and gain a non-semantic suffix on collision.

Roles are enforced by server-side services shared by Server Components and API
routes:

- owners invite any Layer-0 role, change roles, remove members, and transfer
  ownership by promoting another user;
- admins invite or remove members only and cannot affect admins/owners;
- members have read-only workspace access;
- demoting or removing the last owner always fails transactionally.

Membership is checked before each tenant read or write. A nonexistent resource
and a resource outside the actor's tenant both return the same 404 envelope.
Client UI visibility is convenience only, never authorization.

`EntitlementPolicy` is invoked by domain mutations. The community policy allows
all current operations. Authorization is resolved before that policy, so a
guessed tenant or project cannot be distinguished through entitlement behavior.
It intentionally contains no plan, price, billing-provider, or checkout logic;
later entitlements can replace the policy without moving authorization into
route handlers.

Project access adds a second, narrower boundary. Workspace owners and admins
can access every workspace project. Regular members require an explicit
`project_memberships` row. Project creators and leads are enrolled
automatically. The lead or a workspace owner/admin manages project lifecycle
and access; project members manage milestones and backlog work. Removing a
workspace membership cascades current project access while nullable user
references retain historical lead and assignee attribution.

## Client-project delivery model

Migration `0003_delivery_core.sql` adds workspace-scoped clients and projects,
project memberships, milestones, labels, work items, label assignments, and
directed blocking dependencies. Project keys are normalized uppercase and are
immutable and unique within a workspace. Each project owns a locked
`next_work_item_number` counter; creation increments and returns the previous
value in the work-item transaction, preserving unique identifiers under
concurrency.

Clients, projects, milestones, and work items use soft lifecycle fields; there
is no hard-delete domain API. Calendar values use PostgreSQL `date`. The fixed
workflow is `backlog`, `ready`, `in_progress`, `in_review`, `done`, and
`canceled`. Canceled is terminal; done may reopen. Work items have an
independent archive state and may reference one milestone, one primary
assignee, project labels, and at most one parent. A parent cannot itself be a
subtask, and a parent with active subtasks cannot be archived.

Blocking edges stay within one project. A transaction rejects self-links,
duplicates, archived endpoints, and directed cycles. Existing edges and
archived milestone/parent references remain intact for history. Status-group
ordering uses stored integer positions. An up/down action locks the project and
swaps one adjacent item only within the unfiltered status group; creation and
status changes append to the destination group.

Migration `0004_planning_execution.sql` adds optional project-scoped cycles and
a nullable cycle reference on work items. Cycle sequence allocation locks the
project, so concurrently created cycles receive distinct, increasing numbers.
Cycles have date-only bounds and planned, active, completed, and archived
lifecycle states. Completed and archived references remain visible for history,
while default cycle lists and new planning use only planned or active cycles;
explicit lifecycle filters expose history. Cycle planning never changes a work
item's milestone.

The board, backlog, and My work surfaces mutate the same work-item service and
API; the UI has no parallel workflow state. Board moves use explicit native
controls and appear only after the server accepts the transition. My work
selects current assignments across active projects the actor may access,
excludes done and canceled work by default, and supports URL-backed project,
status, priority, milestone, cycle, label, and text filters. Losing workspace or
project membership removes the item on the next request while historical
attribution remains stored. A cross-project assignee/status/target-date index
supports the bounded daily-work query without per-row loading.

## Collaboration and project context

Migration `0005_collaboration_context.sql` adds project-scoped work-item
comments and immutable comment revisions, one-level replies, validated mention
assignments, work-item subscriptions, small project context notes, and durable
in-app notifications. Comment and note text remains customer content: it is
stored only in content tables and never copied to audit metadata or operational
logs. Comment deletion is a tombstone; authorized project members can inspect
the retained revision record while the active thread no longer returns the
deleted body.

Mention identity comes from an encoded user ID selected from the authorized
project audience, not from display text. The service rejects a crafted ID that
does not currently have project access. Mention selection is a bounded,
name-searchable directory rather than a fixed audience snapshot. Comment
retries use a caller UUID and notification writes use recipient-specific dedupe
keys. Comment participants and assignees are subscribed automatically unless
they explicitly mute the work item; a new assignment still creates one direct
notification. Watcher authorization and notification inserts advance in
100-user keyset batches so every valid recipient is reached without an
unbounded query or a first-100 cutoff. Inbox reads join current project access,
so removing membership immediately hides stale links and direct navigation
retains the indistinguishable 404 boundary.

Discussion pages are ordered newest-first so a successful post remains visible
after reload. When a reply and its root fall on different pages, the service
hydrates that root as bounded read-only parent context; the selected page still
contains at most 100 comments plus at most one context root per selected reply.
Discussion, work activity, and project activity expose normal URL-backed page
navigation so the complete retained history remains reachable.

Activity is a bounded, allowlisted projection of immutable audit events. It
returns factual descriptions and historical actor names but never exposes raw
audit metadata. Project notes are limited to 20 active records under a project
lock. All collaboration and inbox flows use PostgreSQL and the existing
versioned API, so Local/LAN deployments need no email, queue, realtime
infrastructure, or other external service.

## Commercial baseline and delivery provenance

Migration `0006_commercial_baseline.sql` adds a project-scoped commercial
delivery graph in PostgreSQL. It stores immutable source originals and hashes,
deterministically extracted text, one initial baseline version, human-curated
scope items with immutable revisions, exact character-offset evidence anchors,
work-purpose classification, and revision-specific commercial-basis links.
Existing work items default to `unclassified`; the migration does not infer or
rewrite business meaning.

Commercial source intake accepts pasted text, text-bearing PDF, and DOCX. Each
source is limited to 5 MB and each project to 100 sources. PDF extraction stops
at 500 pages and all extracted text stops at 500,000 normalized characters.
DOCX archives are inspected before extraction and reject more than 1,000 entries
or 25 MB uncompressed. Image-only PDFs enter the explicit `needs_ocr` state;
SC-006A does not perform OCR, semantic extraction, or AI classification.
Malformed, password-protected, and resource-limit failures retain the private
original with a stable parser state and safe error code so a manager can retry
or use pasted text.

The initial baseline is created only from a successfully parsed source and is
fixed at version 1. Scope items are limited to 500, are manually classified as
deliverable, requirement, exclusion, or constraint, and require at least one
anchor into that baseline source. Editing creates a new immutable revision;
archive/restore changes lifecycle without deleting history. Work links target a
specific current scope-item revision, so later revisions do not rewrite the
commercial meaning that authorized existing work.

Workspace owners/admins and the project lead manage commercial evidence,
baselines, scope, classification, and links. Other authorized project members
can read concise work provenance without receiving source bodies or downloads.
All identifiers are checked against the current project; cross-project anchors,
scope revisions, and work links retain the same indistinguishable 404 boundary
as the delivery domain. Source bodies, extracted text, scope text, and evidence
excerpts are customer-confidential content and never enter audit metadata or
operational logs.

Drift is an advisory projection over active work: unclassified work needs
classification, client-delivery work without a basis link is commercially
unlinked, client-delivery work with a link is baseline-linked, and
delivery-support/internal work is shown separately. Warnings appear in the
Commercial workspace and compact work-item badges but do not block delivery
mutations. Reads are bounded and drift supports normal URL pagination. The
implementation deliberately uses relational constraints and aggregate queries;
no graph database, queue, object store, or managed document service is required
for managed or Local/LAN deployment.

## Commercial request and decision change control

Migration `0007_commercial_change_control.sql` extends the project-scoped graph
with atomic client requests, append-only decision history, evidence-backed
effort/schedule/money assessments, and decision-backed work basis links. Request
state is separate from commercial outcome: `open` and `needs_clarification` are
unresolved, an effective decision resolves the request, and `withdrawn` implies
no approval or rejection.

Every request has at most one current decision. A correction explicitly names
and supersedes that decision inside the same transaction; the former row and
its work links remain intact for historical interpretation. Only a current
`covered`, `absorbed`, `swap`, or `paid_change` decision counts as effective
commercial basis. `deferred` and `rejected` cannot create a work basis. If a
linked authorizing decision is superseded while work remains active, the link
becomes ineffective and the ledger surfaces a contradiction without changing
delivery status. Completed work retains the historical link without a current
work warning.

A `swap` decision requires at least one distinct, active baseline scope item as
its offsetting side. `covered` may optionally classify its existing-obligation
basis. Impact assessments store effort in integer minutes, schedule delta in
integer days and/or an ISO date, and money as PostgreSQL `numeric(18,2)` paired
with a three-letter currency code. Estimate and confirmed confidence are
explicit. Later assessments identify the assessment they supersede rather than
rewriting it.

Workspace owners/admins and the project lead manage the request ledger. Request
bodies, rationale, impact notes, source text, and monetary values are excluded
from audit metadata; events contain identifiers, enums, and changed-field names.
Composite project foreign keys plus server authorization reject cross-project
request, decision, evidence, impact, scope, and work links. The implementation
uses only PostgreSQL and the shared server core, so it has no AI, OCR SaaS,
e-signature, CRM, billing, or managed-cloud dependency.

## Invitations

An invitation stores a normalized email, role, expiry, and SHA-256 hash of a
random token. The raw seven-day token exists only long enough to create the
mail. Its URL uses `#token=...`, so browsers do not send the secret in HTTP
request lines, referrers, access logs, or server-rendered route input.

The acceptance client exchanges the fragment for a short-lived `HttpOnly`,
`SameSite=Lax` cookie, clears the fragment, and then requests acceptance.
Acceptance requires a signed-in, verified account whose normalized email
matches the invitation. Token consumption and membership creation occur in one
database transaction.

## Audit and event contract

Audit events are append-only records with UUID, workspace, actor type/ID,
versioned event type, typed target reference, occurrence time, and allowlisted
metadata. Workspace initialization emits both a human
`workspace.created.v1` event and a system
`workspace.settings.created.v1` event. Other examples include
`workspace.settings.updated.v1`, `membership.role.updated.v1`, and
`workspace.invitation.accepted.v1`. Delivery mutations use the same immutable
event stream; there is no duplicate workflow-history table.

Names, emails, tokens, secrets, and arbitrary customer content are forbidden in
audit metadata. Delivery events record only IDs, enum transitions, and changed
field names—not client, project, work-item, milestone, or label content. Tests
assert the allowlist. Future outbound webhooks will reuse this versioned
envelope; no event delivery or queue exists yet.

## API contract

Better Auth is mounted at `/api/auth/*`. ScopeDelta owns `/api/v1` routes for
workspaces, settings, memberships, invitations, fragment-token staging,
acceptance, clients, projects, project memberships, milestones, cycles, labels,
work items, My work, dependencies, lifecycle actions, and reorder actions.
Project routes also expose commercial sources/downloads/retries, the initial
baseline, scope revisions and archive lifecycle, atomic commercial requests,
request state, decision confirmation/supersession, impact assessments, work
purpose/basis links, and paginated advisory drift.
Successful payloads are `{ data: ... }`; paginated lists include page metadata
inside `data`. Page size defaults to 50 and is capped at 100. Errors are
`{ error: { code, message, fieldErrors? } }`. Route handlers parse bounded JSON,
return stable public error codes, and do not expose database/provider details.

All mutations and authorization live in `src/server/`. Routes are protocol
adapters and Server Components are read adapters. This prevents UI and API
authorization from drifting.

## Repository and test boundaries

- `src/app/`: UI and HTTP adapters.
- `src/components/`: interactive UI.
- `src/server/`: authorized domain services and transactions.
- `src/db/`: Drizzle schema/connection.
- `db/migrations/`: checked-in SQL history.
- `e2e/`: real-browser journeys through PostgreSQL and Mailpit.
- `docs/`: durable decisions and operations.

Unit/component tests run in jsdom. PostgreSQL integration tests validate
migrations, persistence, tenancy, roles, last-owner protection, concurrent work
numbering, subtask/dependency rules, commercial revision/link history, request
and decision idempotency, all six commercial outcomes, impact supersession,
current-work contradictions, parser failure isolation, cross-project graph
rejection, pagination, and safe audit metadata. Playwright verifies identity and
workspace journeys plus client-project backlog creation/editing and the
evidence-to-work commercial path on desktop and mobile.
CI runs the full suite plus production and container builds.

## Deployment and privacy boundaries

`APP_URL`, database URLs, `BETTER_AUTH_SECRET`, and SMTP configuration are
server-only. `DATABASE_URL` is a least-privilege Netlify runtime value;
`DATABASE_MIGRATION_URL` exists only in a GitHub migration step or a
self-host operator environment. `NEXT_PUBLIC_` remains reserved for deliberately
public values. Database URLs, cookies, tokens, credentials, names, emails, lead
payloads, and customer content must not enter logs or fixtures. Operational logs
use fixed, non-PII event names.

Netlify remains the managed host; Neon Free and Resend Free are optional
reference providers, not application dependencies. A self-host uses the same
container with PostgreSQL, SMTP, a TLS reverse proxy, and independent backups.
The public lead webhook remains a separate no-database privacy boundary.

Managed deployment secrets are GitHub Actions repository secrets so the private
repository remains compatible with GitHub Free. This choice has no deployment
approval gate: `main`, repository write access, and workflow changes are the
security boundary. The Netlify CLI credential is a user-scoped personal access
token whose authority may extend beyond this site; `NETLIFY_SITE_ID` selects a
target but does not narrow the token. Operational controls therefore minimize
the deployment identity's access and require short expiry, rotation, and
revocation procedures.

Local/LAN operation does not call ScopeDelta Cloud for identity, authorization,
workspace, membership, settings, or audit capabilities. The repository remains
private until the separate LIC-001 founder/legal decision permits a protected
source-visible release; this architecture makes no open-source license promise
and does not rely on source secrecy for security.

## Tradeoffs and explicit limits

- One application minimizes operational surface and preserves portability, but
  UI and server interfaces deploy as one unit.
- Database session checks add a read to protected requests, but revocation and
  tenant access changes take effect without a stale cookie cache.
- Synchronous domain transactions keep authorization and audit writes atomic.
  No job queue or webhook delivery is introduced before a requirement needs it.
- PostgreSQL and SMTP require production operations, but replace hosted identity
  lock-in and keep self-hosting credible.
- Server-authoritative collaboration avoids premature offline conflict
  resolution. A later desktop client can add bounded caching or retry behavior
  without relocating authorization or durable tenant state onto user devices.
- SC-005B deliberately keeps the fixed workflow and explicit accessible move
  controls; it does not add drag/drop, workflow configuration, saved views,
  Git/CI integration, AI, billing, SSO/SCIM, client portals, analytics, or
  outbound audit webhooks. SC-006A stores only bounded commercial evidence in
  PostgreSQL and does not add OCR, automated extraction, amendments, impact
  analysis, or change-order workflows.
