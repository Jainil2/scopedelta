# ScopeDelta WebMCP Challenge Submission Draft

## Working title and pitch

**ScopeDelta — Keep delivery tied to the agreement**

ScopeDelta helps small software agencies detect when active delivery has drifted from the current commercial agreement. Through four WebMCP tools, an authenticated project lead can ask what needs attention, find related work, inspect factual drift categories with provenance, and create the next ordinary work item without leaving the conversation. The same authorization, audit, validation, and UI workflows used by humans remain in control.

## Submission copy

Small agencies rarely lose margin because they cannot track tasks. They lose it when delivery changes faster than the commercial agreement: a ticket still points at an old scope revision, client work has no basis, or urgent work was never classified.

ScopeDelta turns its existing authenticated workspace into a safe browser-tool surface. The agent can list the signed-in user’s assigned work, search project work, summarize five factual commercial-drift categories, and create normal delivery work. It uses the user’s browser session and the same server routes and domain services as the UI—there is no privileged agent backend, copied customer context, or bypass around project authorization.

The NOVA demo makes the core value legible in under three minutes. A real baseline is activated, then a real amendment revises checkout scope. One active ticket remains linked to the older revision, producing stale-basis drift through lineage rather than a fabricated label. The judge can identify it, see the complete factual category counts, and create a follow-up that appears immediately in the ordinary product.

## Rubric mapping

### Technical implementation

- Exactly four imperative WebMCP tools with strict schemas and bounded, model-safe projections.
- Existing same-origin API routes, browser session, domain validation, audits, and authorization are reused.
- Registration is awaited, independently abortable, reconciled after remount/navigation, and protected against duplicate/stale registries.
- Reads preserve cancellation. The write never retries an ambiguous POST and tells the caller to search before retrying.
- Both required isolation/capability headers are emitted for SSR/function and static responses.
- The judge fixture is deterministic, idempotent, verified with Better Auth’s password verifier, and protected by exact identity/workspace/reset markers.

### Usefulness and impact

- The entry addresses agency margin leakage and change-order readiness, not generic task creation.
- It connects delivery facts to the current agreement while keeping the result advisory.
- The created remediation item returns to the same backlog/My Work interface the team already uses.

### Quality and polish

- A purpose-built synthetic project produces one result in each drift category.
- Human-readable project key `NOVA` avoids exposing opaque IDs to the model.
- Unsupported browsers retain the complete normal product experience.
- The submission provides exact prompts, reproducible reset, repository-safe evidence, and exact-SHA checks.

### Creativity and originality

- Commercial lineage—not keyword matching—shows when delivery is based on an obsolete agreement revision.
- The agent is a focused interface over an existing multi-user operating system, not a disconnected chatbot or demo-only endpoint.
- One conversation moves from detection to an auditable remediation item without granting the agent new business powers.

## Prompt-to-tool proof

| Judge prompt                                                                                                                     | Expected tool          | Proof to capture                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| “What assigned work needs my attention?”                                                                                         | `list_my_work`         | Five assigned NOVA base items with delivery context.                |
| “In project NOVA, find the wholesale discount work.”                                                                             | `search_work_items`    | `Add wholesale discount rules`.                                     |
| “Why is delivery drifting from the current commercial agreement in NOVA? Give me the factual category counts and affected work.” | `get_commercial_drift` | Counts of one for all five categories and the five affected titles. |
| “In NOVA, create a high-priority work item titled ‘Confirm wholesale change-order review’ and assign it to me.”                  | `create_work_item`     | Stable created item followed by the same title in ordinary UI.      |

## Under-three-minute storyboard

Target duration: **2:45**, leaving fifteen seconds below the limit.

| Time      | Screen and narration                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:15 | Title over NOVA workspace. “Agencies do not just need task tracking. They need to know when delivery no longer matches the agreement.”                                                                                                           |
| 0:15–0:30 | Show the four active browser tools. State that they reuse the signed-in session and existing authorization/domain services.                                                                                                                      |
| 0:30–0:50 | Ask prompt 1. Briefly show the five assigned NOVA items.                                                                                                                                                                                         |
| 0:50–1:10 | Ask prompt 2. Highlight `Add wholesale discount rules` and its project context.                                                                                                                                                                  |
| 1:10–1:55 | Ask prompt 3. Center the response and ordinary drift ledger: one linked, stale basis, commercially unlinked, needs classification, and support/internal. Explain that stale basis comes from an effective baseline followed by a real amendment. |
| 1:55–2:25 | Ask prompt 4. Show the returned created item, then the same high-priority assigned item in the normal backlog/My Work UI.                                                                                                                        |
| 2:25–2:38 | Refresh. Show exactly four tools with no duplicates. Mention unsupported browsers keep the normal UI.                                                                                                                                            |
| 2:38–2:45 | Closing: “ScopeDelta keeps delivery tied to the agreement—through the tools teams and agents already use.”                                                                                                                                       |

Avoid showing sign-in entry, account menus, cookies, network request headers, database IDs, private email, or password in the video. Use tight crops and repository-safe screenshots.

## Final evidence block

Complete this block only from the deployed exact merge-candidate SHA:

- Production URL: `https://scopedelta.netlify.app`
- Commit SHA: `<exact deployed SHA>`
- Production deploy/run: `<public-safe link or result>`
- Required headers: `<observed values>`
- Four tools before/after refresh: `<observed names/count>`
- Fresh-session prompt mapping: `<four observed selections>`
- Visible mutation: `<ordinary UI location>`
- Unsupported-browser behavior: `<observation>`
- Cold/warm performance: `<observations>`
- Repository-safe screenshots: `<paths>`
- Final hosted gate: `<exact SHA and result>`
- Post-merge production verification: `<merged SHA and observation>`

## Founder submission checklist

- Resolve LIC-001 and make the repository public only after founder/legal approval.
- Confirm challenge eligibility and register/attest on Devpost.
- Put the private `.test` judge credentials into the submission’s private credential fields only.
- Record and upload a public demo video shorter than three minutes.
- Confirm the working URL is publicly reachable while the authenticated judge workspace remains isolated.
- Submit before September 3, 2026 at 1:00 PM Pacific under the [official challenge page](https://openai.com/webmcp-challenge/) and [Devpost rules](https://webmcp.devpost.com/rules).
