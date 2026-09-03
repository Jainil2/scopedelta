# ADR-017 — Browser tools for the full product lifecycle

Status: Implementation proposed for review
Date: 2026-09-03
Issue: [WEBMCP-002 #76](https://github.com/Jainil2/scopedelta/issues/76)

## Context

The initial WebMCP challenge exposed four shortcuts inside an existing workspace. They could inspect assigned work and commercial drift and create a work item, but could not take a newly authenticated person through workspace, client and project creation. Demo seeding supplied a repeatable recording scenario; it did not fill those capability gaps.

The founder requested a complete inventory of interactive controls and one tool per functional workflow, covering the existing product services. This supersedes the four-tool cap in the earlier challenge and recording scope. The domain rules in ADR-007 through ADR-016 remain authoritative.

## Decision

- Maintain an explicit catalog of business flows. Each tool selects a named action with a fixed method/path, existing shared input schema, and optional confirmation or human handoff. No caller-supplied endpoint, HTTP method, session, credential, or workspace override is accepted.
- Reuse the ordinary same-origin APIs and server authorization, entitlements, validation, transactions, idempotency and audit behavior. The browser adapter introduces no privileged server identity or database migration.
- Expose workspace creation on authenticated setup pages, workspace flows in the internal shell, and only client-projection flows in the client shell. Public account pages expose navigation and handoff tools only. Keep the original four shortcuts compatible. Register lightweight discovery/navigation immediately, then load one business workflow at a time through `discover_workflows.load`; discovery still lists the full surface-appropriate catalog. Replace the prior workflow registration and cancel its pending reads/confirmations before loading another. Refresh native tool discovery after selection.
- Bind registrations and execution signals to the document and workspace. Cancel pending reads/confirmations on disposal, reject stale calls, and never abort or automatically retry a dispatched write. Report an uncertain write outcome when its response is lost or unreadable; users must inspect current records before retrying.
- Derive action schemas from the same Zod contracts used by the server. Generate omitted idempotency keys (including nested impact records and comment/note request keys), preserve supplied keys, and default a new project's omitted lead to the signed-in user. These are input conveniences, not authorization substitutes.
- Use an actual application confirmation dialog for access changes, lifecycle changes, commercial decisions/activation, client publication/acceptance, QA attestations, AI execution/application, exports and other catalog-marked consequential actions. An agent-provided `confirmed` flag cannot approve an action. Existing typed lifecycle acknowledgements and server eligibility checks still apply.
- Keep credential entry, invitation acceptance, provider OAuth, payment completion, native desktop settings and pilot-form submission in their human interfaces. For client invitations, `sendEmail: true` uses the existing email route after confirmation; private-link-only invitations open the normal screen so the person can generate and copy the link without putting its secret in a tool response. Signed webhooks, OAuth callbacks and native transports are not business commands.
- Return bounded, untrusted results, omitting credential fields and credential links. Preserve record identifiers and pagination metadata. Source reads support successive text excerpts with UTF-16 offsets so later evidence anchors remain usable. Downloads use the ordinary authorized export/source routes and save to the person's browser instead of returning file bytes to the agent.
- Publish a searchable workflow explorer with normal screen links, a first-user sequence, and copyable agent prompts. Generate a source-level control and API inventory so additions can be reconciled with the catalog.

## Consequences and limits

No demo account or seeded project is necessary for the authenticated first-user lifecycle. The `WEBMCP_DEMO_*` values remain optional fixture-script inputs, not runtime requirements for these tools.

The catalog provides coverage of existing product functionality; it does not claim that every role can perform every action or that provider services are configured. The server can still deny an action or require setup. Some workflows span multiple actions: an AI job must complete and its candidates must be reviewed; a draft scope version must be completed before activation; imports must be previewed before confirmation.

Browser tests use a protocol harness to invoke registered tools against real local authentication, APIs and PostgreSQL. They prove application integration and persistence, not autonomous model selection or native-browser compatibility. Native agent and provider-specific rehearsal remains separate evidence. The earlier four-tool demo script is historical and must be revised before recording this expanded product.

During the September 3 HACK-DEMO rehearsal, the native browser rejected the all-at-once workspace configuration as exceeding supported limits despite the app showing 59 registered tools. The founder authorized the narrow registration fix in [#74](https://github.com/Jainil2/scopedelta/issues/74#issuecomment-5523884838). Loading one workflow bounds the active set to eleven tools (seven outside workspaces). A 32 KB serialized-registration regression budget is an application guardrail, not a claim about an undocumented browser limit. No API permissions, domain rules, environment values or database schema change.
