# Layer 5 — AI-Native Delivery Intelligence Research

Date: 2026-08-15
Decision issue: SC-009 / #17

## Research question

How can ScopeDelta reduce delivery-coordination work with AI without turning
commercial authorization, engineering evidence, or client communication into
unreviewable model output?

## Market and workflow findings

General project-management assistants optimize summarization and task creation.
Developer assistants optimize repository retrieval and code generation. Test
assistants optimize test drafting. Contract and change-order tools optimize
document comparison. The unresolved agency workflow crosses all four domains:
the same client request must be compared with the effective commercial basis,
translated into delivery work, checked against implementation and QA evidence,
and explained without fabricating authorization or acceptance.

The differentiator is therefore not a general chat surface. It is a bounded
delivery-graph job whose claims can be resolved to existing records and whose
mutations require a confirming human.

## Product conclusions

1. The first production jobs should be contextual and outcome-specific:
   Scope Change Analyst, Delivery Risk Brief, and Work Context & QA Pack.
2. Deterministic status, coverage, staleness, and authorization facts remain
   server-authored. AI interpretation is labeled separately.
3. Models receive server-issued evidence keys instead of executable record IDs.
   Returned citations are validated against the immutable snapshot.
4. Scope-analysis actions are limited to draft backlog work and internal draft
   clarification questions. They cannot authorize a request, publish to a
   client, alter acceptance, or create a commercial link.
5. Provider choice is deployment-wide and explicit. Automatic fallback is a
   privacy violation because it can send customer data to an unselected second
   processor.
6. Durable jobs, immutable attempts, explicit retry, leases, idempotency, and
   usage metadata are required before paid-provider operation.
7. A local Ollama path is valuable for self-host evaluation, but no model is
   downloaded automatically and local quality must be evaluated against the
   same provider-neutral fixtures.

## Provider contract findings

- OpenAI Responses supports JSON Schema structured output; requests set
  `store: false`.
- Anthropic Messages supports JSON Schema through `output_config.format` and
  can return refusals that must override normal schema handling.
- Gemini `generateContent` supports JSON response schemas and usage metadata.
- Ollama `/api/chat` accepts a JSON Schema `format` with non-streaming output.

ScopeDelta uses thin server-only HTTP adapters so data handling, timeout,
response-size, refusal, error, and usage normalization remain visible in the
application boundary. Provider SDKs and automatic routing are unnecessary for
this layer.

References:

- OpenAI Responses API: <https://platform.openai.com/docs/api-reference/responses>
- Anthropic structured outputs: <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
- Gemini generateContent: <https://ai.google.dev/api/generate-content>
- Ollama structured outputs: <https://docs.ollama.com/capabilities/structured-outputs>

## Privacy and operating conclusions

AI context/result content stays in PostgreSQL and is excluded from ordinary
logs and the client-safe projection. Hosted-provider terms, retention, region,
and training controls remain an operator procurement decision. Self-hosted
Ollama keeps inference local to the selected endpoint but does not remove the
need to secure that endpoint and model host.

Defaults are intentionally bounded: one active job per user, three per
workspace, ten starts per user/hour, 100 per workspace/day, 40,000 context
characters, 4,000 output tokens, a 60-second timeout, and a bounded response.
Configuration may lower or raise defaults only within server hard caps.

## Deferred

Vector search, repository-source ingestion, a coding agent, autonomous client
messaging, per-workspace provider credentials, model routing/fallback, price
tables, and a general agent framework remain outside SC-009.
