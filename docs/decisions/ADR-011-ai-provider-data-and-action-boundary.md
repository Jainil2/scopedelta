# ADR-011 — AI provider, data, and bounded-action boundary

Status: Accepted
Date: 2026-08-15
Issue: SC-009 / #17

## Context

ScopeDelta needs AI reasoning across commercial, delivery, engineering, and QA
evidence. Customer content may be commercially sensitive. Model calls cost
money, can fail after spend, can produce invalid citations, and can vary by
provider. AI suggestions must not silently become commercial authorization,
client publication, completion evidence, or acceptance.

## Decision

One deployment selects exactly one active provider and model. The server
implements a provider-neutral generation interface with native HTTP adapters
for OpenAI Responses, Anthropic Messages, Gemini `generateContent`, and Ollama
chat. There is no automatic provider/model fallback.

Each job persists a bounded immutable context snapshot, evidence-key map,
prompt version, canonical fingerprint, provider/model identity, result, and
immutable attempt/usage records. Execution uses PostgreSQL leases and Next.js
post-response scheduling. An expired lease becomes an explicit recoverable
failure; only a user-triggered retry can spend again.

Model output is validated twice: provider JSON Schema and final Zod parsing.
All cited evidence keys must exist in the stored server-issued map. Raw customer
content and provider responses are never written to ordinary logs.

Only scope-analysis candidates can create records in SC-009. A manager previews
and confirms at most ten selected records. One transaction rechecks authority,
the `delivery.work.manage` entitlement, target scope, job state, evidence, and
fingerprint. Created work is backlog, unclassified, unassigned, and
commercially unlinked. Clarifications are internal drafts. Audit history records
both the confirming human and AI-agent provenance.

## Consequences

- Provider changes are explicit deployment operations with a clear privacy
  boundary.
- PostgreSQL is sufficient for current low-volume durable execution; no queue
  service is introduced.
- Results can become stale and must be rerun before confirmation.
- Usage is cost-relevant telemetry for SC-010, but prices are not embedded.
- Local Ollama is supported without silently pulling or choosing a model.
- Long-running background reliability beyond the current bounded jobs may
  justify a dedicated worker/queue in a future issue.
