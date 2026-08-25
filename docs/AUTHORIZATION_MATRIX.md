# Authorization Matrix

## Contract

This is the durable authorization audit for Layers 0–7. Server domain services
are authoritative; hidden UI is never authorization. Authenticated mutations
call `requireApiActor`, which applies the canonical same-origin check before
resolving a verified database session. The only unauthenticated mutation
exceptions are signed Paddle/GitHub webhooks and invitation-token staging.

Unknown and cross-tenant IDs normally return the same `not_found` response.
Role failures are returned only after active tenant/project access is known.
Suspended internal members and revoked client participants have no active
access. Invitation/recovery tokens are hashed, expiring, single-purpose, and
rejected after acceptance, revocation, reissue, or session revocation.

| Layer | Surface                                                          | Read boundary                                           | Mutation boundary                                              | Required negative coverage                                                                                      |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0     | Account, recovery, workspace, membership, invitation, audit      | verified session and active membership                  | owner for workspace/lifecycle/export; owner/admin member split | cross-workspace IDs, suspended member, revoked/expired token, stale session/recovery, last owner, oracle parity |
| 1     | Client, project, milestone, cycle, work                          | active workspace and project access                     | project manager/lead/assignee rules                            | cross-project nested IDs, archived writes, removed grant, role escalation                                       |
| 2     | Commercial source/baseline/request/decision/impact               | commercial manager/lead projection                      | manager/lead confirmation; immutable superseding history       | unauthorized member, cross-project evidence, stale version/idempotency                                          |
| 3     | Client projection/request/packet/discussion/acceptance           | active participant and allowlisted projection           | participant role/target rules; authorized internal publication | revoked participant, cross-project target, token reuse, internal-field omission                                 |
| 4     | GitHub, implementation, QA, defects                              | active internal project access; never client projection | manager for provider/QA; signed webhook                        | cross-repository IDs, revoked installation, invalid signature, failed-delivery recovery                         |
| 5     | AI job/attempt/preview/confirmed action                          | project access and job-kind authorization               | manager/lead, confirmation, entitlement, throttle              | cross-job, stale context/config, suspension, duplicate action, expired lease                                    |
| 6     | Billing, entitlement, usage                                      | owner billing; server capability checks                 | owner checkout/portal; signed Paddle webhook                   | member/admin billing access, invalid replay, stale event, allowance exhaustion                                  |
| 7     | Portfolio, allocation/time, template, import, onboarding, signal | active internal access; restricted commercial signals   | owner/admin/project-manager split; bounded import/export       | cross-workspace filters/session, suspension, import replay, bounded pagination                                  |

`src/server/api-route-contract.test.ts` walks every `/api/v1` mutation route and
fails unless it invokes the session/same-origin boundary or an explicitly
reviewed signed-provider/invitation-token boundary. New exceptions require an
update to both that test and this document.

Authenticated, client, invitation, sign-in/up, and recovery surfaces receive
`private, no-store`, no-index, no-referrer, nosniff, and frame-denial headers.

Audit metadata may contain IDs, enums, timestamps, counters, hashes, safe
dimensions, and safe error codes only. It must not contain names, emails,
recipients, documents, comments, source text, prompts/results, credentials,
tokens, or raw provider payloads. Operator lifecycle events use a stable UUID
provided explicitly to `pnpm lifecycle:process`.
