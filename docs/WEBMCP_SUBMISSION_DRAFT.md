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
- A role-aware NOVA command center opens on client, lead, team, delivery horizon, baseline, drift, and assigned attention work before any tool is invoked.
- Persistent grouped navigation, immediate loading feedback, native authenticated form controls, keyboard focus, and narrow-screen overflow checks keep the judge journey coherent.
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

| Time      | Screen and narration                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:18 | Open on the NOVA command center: client, lead, team, active cycle, launch milestone, current baseline, all five drift counts, and assigned attention. “Agencies need to know when delivery no longer matches the agreement.”                      |
| 0:18–0:32 | Show the four active browser tools. State that they reuse the signed-in session and existing authorization/domain services.                                                                                                                       |
| 0:32–0:52 | Ask prompt 1. Briefly show the five assigned NOVA items and the matching command-center attention list.                                                                                                                                           |
| 0:52–1:12 | Ask prompt 2. Highlight `Add wholesale discount rules` and its project context.                                                                                                                                                                   |
| 1:12–1:55 | Ask prompt 3. Center the response and ordinary drift ledger: one linked, stale basis, commercially unlinked, needs classification, and support/internal. Explain that one internal summary request shares the authoritative classification logic. |
| 1:55–2:25 | Ask prompt 4. Show the returned created item, then the same high-priority assigned item in Backlog, My Work, and the refreshed command-center attention list.                                                                                     |
| 2:25–2:38 | Use the persistent project bar to return to Overview, then refresh. Show exactly four tools with no duplicates and mention that ordinary members do not see Commercial.                                                                           |
| 2:38–2:45 | Closing: “ScopeDelta keeps delivery tied to the agreement—through the tools teams and agents already use.”                                                                                                                                        |

Avoid showing sign-in entry, account menus, cookies, network request headers, database IDs, private email, or password in the video. Use tight crops and repository-safe screenshots.

## Final release evidence

Last updated: **2026-08-31**. This is the durable HACK-003 release record. Do
not replace pending entries with assumptions or evidence from a different
commit.

### Exact release and deployment

| Evidence                         | Result                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved starting `main`         | `b47d15dbcf972782830c72c4d555195b8368b984`                                                                                                              |
| Deployed production SHA          | `b47d15dbcf972782830c72c4d555195b8368b984`                                                                                                              |
| Production URL                   | `https://scopedelta.netlify.app`                                                                                                                        |
| Unique deploy URL                | `https://6a954849b662aa4e25e32663--scopedelta.netlify.app`                                                                                              |
| Netlify deploy identifier        | `6a954849b662aa4e25e32663`                                                                                                                              |
| Production deploy run            | [GitHub Actions run 33377453605](https://github.com/Jainil2/scopedelta/actions/runs/33377453605), successful on the exact SHA above                     |
| Build observation                | Production build and deploy succeeded; Netlify's public-root Lighthouse run reported performance 98, accessibility 98, best practices 100, and SEO 100. |
| HACK-003 release-preparation SHA | Pending until this documentation/release-tooling PR is committed. It does not change the four WebMCP contracts or product behavior.                     |

### Verified observations

- A fresh unauthenticated request to `/sign-in` returned `200` with
  `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)` on the
  deployed SHA.
- Source and automated contract inventory still contain exactly these four
  names, in this order: `list_my_work`, `search_work_items`,
  `get_commercial_drift`, and `create_work_item`. No fifth tool or alternate
  agent endpoint was added.
- The production deployment run checked out and logged the exact deployed SHA
  before applying migrations and deploying.
- A fresh unauthenticated in-app-browser session loaded the normal public
  ScopeDelta experience. It had no access to the protected judge session, as
  expected.
- Chrome with the required connected WebMCP extension was not available to the
  HACK-003 execution session. Do not claim Chrome prompt-selection evidence
  from unit tests or a mocked model context.

### Protected fresh-session proof — pending

The following evidence requires the protected `.test` judge credential and a
compatible browser session. Neither is present in the repository, local
environment, or GitHub repository secrets, and they must not be reconstructed
or printed in logs.

| Required proof                       | Status and exact completion evidence                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic NOVA reset/seed/verify | Pending protected runtime access. Use the manual production workflow with `webmcp_demo_command=reset`; it invokes the existing guarded HACK-001 path. |
| Ordinary Better Auth sign-in         | Pending protected judge credential. No bypass is permitted.                                                                                           |
| Four tools before/after refresh      | Pending fresh authenticated compatible-browser capture.                                                                                               |
| Natural-language prompt mapping      | Pending the four prompts in the table above in ChatGPT's in-app browser, then Chrome if available.                                                    |
| Commercial drift/UI correlation      | Pending deployed authenticated observation; expected pristine fixture is one item in each of the five factual categories.                             |
| Visible mutation                     | Pending proof in ordinary Backlog, Overview attention, and My Work after `Confirm wholesale change-order review` is created.                          |
| Expired/re-authenticated session     | Pending compatible-browser negative proof; must not report tool success after authorization expires.                                                  |
| Authenticated unsupported-browser UI | Pending sign-in in a browser without WebMCP; normal UI must remain usable.                                                                            |
| Cold/warm production measurements    | Pending exact timings for Overview, Backlog/My Work, Commercial, drift read, and create-to-visible. Record cold separately from warm.                 |
| Immediate pending feedback           | Pending deployed observation; click feedback target remains roughly 200 ms.                                                                           |

### Optional Gemini status

- The existing implementation path is `src/server/ai/provider.ts` plus
  `src/lib/env.ts`; Gemini remains optional and separate from all four WebMCP
  tools.
- No `GEMINI_API_KEY`, `AI_ENABLED`, `AI_PROVIDER`, or `AI_MODEL` value is
  available to this checkout or through GitHub repository secrets.
- The manual production workflow reports only bounded readiness booleans plus
  provider/model, never the key. If it reports a configured Gemini environment,
  run one existing AI job against synthetic NOVA data and record provider,
  model, duration, and bounded result classification here.
- Current result: **FOUNDER INPUT REQUIRED — protected Gemini key/runtime
  configuration. Non-blocking to the WebMCP release.**

### Exact-SHA production procedure

The production workflow accepts an exact 40-character commit SHA and fails if
the checkout differs. For the final approved candidate, dispatch
`production-deploy.yml` with that SHA and choose `reset` for
`webmcp_demo_command`. The workflow deploys the SHA, reports only non-secret
runtime readiness, then uses `pnpm webmcp:demo reset`, whose existing guards
verify the reserved workspace boundary, ordinary Better Auth credential, base
work, and drift counts.

After the guarded result reports `pristine: true`, perform the fresh browser
sequence once and record the observations above before recording the video.

### Release gates and external artifacts

- Final hosted merge gate: pending exact HACK-003 merge-candidate SHA and
  CEO/product confirmation that no blocker remains.
- Publication-readiness snapshot: `Jainil2/scopedelta` is still private and
  GitHub reports no detected license, as LIC-001 requires. A bounded tracked-file
  scan found no Gemini/OpenAI-key or credential-bearing PostgreSQL URL pattern.
  GitHub secret scanning is disabled for this private repository and `gitleaks`
  is not installed in the release environment, so this is not a full-history
  clearance. Run an approved full-history secret/private-data scan before any
  publication action.
- Repository-safe screenshots: pending final compatible-browser proof. Keep
  credentials, account menus, cookies, request headers, and database IDs out of
  captures.
- Public repository URL and public repository SHA: **FOUNDER-GATED — pending
  LIC-001 / #19.**
- Public video URL: **FOUNDER/MANUAL — pending.**
- Devpost status: **FOUNDER/MANUAL — pending.**
- Post-merge production verification: pending merged SHA and final observation.

## Founder submission checklist

- Resolve LIC-001 and make the repository public only after founder/legal approval.
- Confirm challenge eligibility and register/attest on Devpost.
- Put the private `.test` judge credentials into the submission’s private credential fields only.
- Record and upload a public demo video shorter than three minutes.
- Confirm the working URL is publicly reachable while the authenticated judge workspace remains isolated.
- Submit before September 3, 2026 at 1:00 PM Pacific under the [official challenge page](https://openai.com/webmcp-challenge/) and [Devpost rules](https://webmcp.devpost.com/rules).
