# ScopeDelta WebMCP Challenge Submission Draft

Updated September 3, 2026 for the workflow expansion merged in [PR #77](https://github.com/Jainil2/scopedelta/pull/77), commit `a44b619153df508d8cc91e8a1a0f678524974919`. The founder reports production availability. Native-browser rehearsal and the final video are still pending; this is proposed submission copy, not fresh execution evidence.

## Working title and pitch

**ScopeDelta — Keep delivery tied to the agreement, from setup to completion**

ScopeDelta helps small software agencies keep delivery connected to commercial scope and client decisions. A browser agent can help create a workspace and project, organize work, inspect factual commercial drift, prepare a reviewed change decision, and carry delivery through client acceptance and project completion. People retain responsibility for access, commercial treatment, publication and approval.

## Submission copy

Small agencies lose margin when delivery changes faster than the agreement. ScopeDelta connects the agreed scope, current work, client requests and recorded decisions so a team can see what needs attention and what has actually been approved.

Its WebMCP integration now spans the product lifecycle. A first user can sign in normally and ask an agent to create a workspace, client and project without a seeded database. The agent works through the same session, server routes and domain rules as the ordinary application. Consequential actions pause for human review in ScopeDelta; external client tools expose the authorized client projection.

The proposed NOVA demo follows a small launch-scope review engagement. The original agreement excludes wholesale discounts. A client requests additional review, and the agent identifies the resulting work without a commercial basis. A manager reviews a paid-change decision, the client approves its published packet, and the work is linked to the decision. The team reviews the checklist, obtains separate delivery acceptance, then confirms project completion. Every claimed result must appear in the ordinary product during rehearsal and recording.

## Implementation and value

- The [source inventory](workflows/README.md) maps 55 business workflow tools to 156 directly invoked API operations, with separate discovery/navigation and human handoffs. The four original shortcuts remain compatible. These are catalog counts, not a claim that the video executes every tool.
- Tools use existing authentication, authorization, validation and audit behavior. Source uploads, draft baselines, commercial decisions, client approvals and delivery acceptance keep their distinct meanings.
- The [operator runbook](HACK_DEMO_RUNBOOK.md) demonstrates the empty-workspace path and preserves real human confirmations, actual returned IDs and visible state changes.
- No extra Netlify environment values or demo fixture are required for that path. External provider services still require their own configuration; the main story does not invoke built-in AI, GitHub or payment processing.
- The commercial explanation remains the central moment: factual agreement drift leads to a traceable human decision and ordinary delivery work.

## Current recording plan

Use [HACK_DEMO.md](HACK_DEMO.md) as the single current script: **2:50, nine scenes, 322 narration words**. It replaces the old pre-seeded four-tool storyboard. The cut shows one coherent engagement rather than an inventory tour.

| Story stage                  | Tool examples                                                                                                               | Required visible proof                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Start from zero              | `workspace_setup`, `client_accounts`, `project_lifecycle`                                                                   | Empty project list followed by the created NOVA project.                                       |
| Establish scope and work     | `commercial_evidence`, `commercial_agreement`, `commercial_scope`, `delivery_work`, `work_commercial_basis`, `list_my_work` | Activated evidence-backed baseline and matching assigned retail work.                          |
| Handle a client request      | `client_requests`, `search_work_items`, `get_commercial_drift`                                                              | Actual client request; wholesale work without a basis; matching ordinary ledger.               |
| Review and approve treatment | `commercial_decisions`, `client_request_review`, `client_packet_response`, `create_work_item`                               | Manager confirmation, exact approved client packet, visible follow-up and decision link.       |
| Accept delivery and complete | `qa_verification`, `client_acceptance_publication`, `client_delivery_acceptance`, `project_lifecycle`                       | Actual review findings, accepted delivery snapshot, confirmed completion and retained project. |

The complete recording needs genuine Team and external Client Approver sessions. An internal-only draft must end at awaiting client approval and cannot claim the full engagement is finished. Read [HACK_DEMO_STATE.md](HACK_DEMO_STATE.md) for current assets and remaining capture work. The v1 voice track does not match this script.

## Historical final release evidence — August 31

The following HACK-003 record is retained as historical evidence. Its four-tool counts, missing-demo-configuration observations and pending entries describe the earlier release. They do not describe the merged workflow catalog or the founder's September 3 environment update. Its reset instruction is not an instruction to reset the v2 recording workspace. Use the current script and handoff above for recording status.

Last updated: **2026-08-31**. This is the durable HACK-003 release record. Do
not replace pending entries with assumptions or evidence from a different
commit.

### Exact release and deployment

| Evidence                          | Result                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved application-behavior SHA | `b47d15dbcf972782830c72c4d555195b8368b984`                                                                                                                                                                                                                                            |
| Initial exact production SHA      | `b47d15dbcf972782830c72c4d555195b8368b984`                                                                                                                                                                                                                                            |
| Production URL                    | `https://scopedelta.netlify.app`                                                                                                                                                                                                                                                      |
| Unique deploy URL                 | `https://6a954849b662aa4e25e32663--scopedelta.netlify.app`                                                                                                                                                                                                                            |
| Netlify deploy identifier         | `6a954849b662aa4e25e32663`                                                                                                                                                                                                                                                            |
| Production deploy run             | [GitHub Actions run 33377453605](https://github.com/Jainil2/scopedelta/actions/runs/33377453605), successful on the exact SHA above                                                                                                                                                   |
| Build observation                 | Production build and deploy succeeded; Netlify's public-root Lighthouse run reported performance 98, accessibility 98, best practices 100, and SEO 100.                                                                                                                               |
| HACK-003 release-preparation SHA  | The linked PR head and exact-SHA workflow run are authoritative, avoiding a self-referential hash in this file. This PR does not change product behavior.                                                                                                                             |
| Protected configuration probe     | [Run 33380208891](https://github.com/Jainil2/scopedelta/actions/runs/33380208891) deployed exact SHA `6f76bb2aec2ac423fa7316227813a38649faaa9f` as Netlify deploy `6a95504f1e9f209a3ab042d3`; its post-deploy reset failed closed because the protected demo configuration is absent. |

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
compatible browser session. The exact-SHA production readiness probe confirmed
that the Netlify environment currently has neither the demo enable marker nor
the judge credential. They are also absent from the repository, local
environment, and GitHub repository secrets and must not be reconstructed or
printed in logs.

| Required proof                       | Status and exact completion evidence                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic NOVA reset/seed/verify | Blocked on protected Netlify demo configuration. Run 33380208891 invoked the guarded path, which failed closed with `demo_disabled` before mutation. After configuration, rerun with `webmcp_demo_command=reset`. |
| Ordinary Better Auth sign-in         | Pending protected judge credential. No bypass is permitted.                                                                                                                                                       |
| Four tools before/after refresh      | Pending fresh authenticated compatible-browser capture.                                                                                                                                                           |
| Natural-language prompt mapping      | Pending the four prompts in the table above in ChatGPT's in-app browser, then Chrome if available.                                                                                                                |
| Commercial drift/UI correlation      | Pending deployed authenticated observation; expected pristine fixture is one item in each of the five factual categories.                                                                                         |
| Visible mutation                     | Pending proof in ordinary Backlog, Overview attention, and My Work after `Confirm wholesale change-order review` is created.                                                                                      |
| Expired/re-authenticated session     | Pending compatible-browser negative proof; must not report tool success after authorization expires.                                                                                                              |
| Authenticated unsupported-browser UI | Pending sign-in in a browser without WebMCP; normal UI must remain usable.                                                                                                                                        |
| Cold/warm production measurements    | Pending exact timings for Overview, Backlog/My Work, Commercial, drift read, and create-to-visible. Record cold separately from warm.                                                                             |
| Immediate pending feedback           | Pending deployed observation; click feedback target remains roughly 200 ms.                                                                                                                                       |

### Optional Gemini status

- The existing implementation path is `src/server/ai/provider.ts` plus
  `src/lib/env.ts`; Gemini remains optional and separate from all four WebMCP
  tools.
- No Gemini or AI configuration value is available to this checkout or through
  GitHub repository secrets. The exact-SHA Netlify readiness probe reports only
  bounded configuration facts, never the key.
- Run 33380208891 reported `gemini_key_configured: true`, but
  `ai_enabled: false` with provider and model unset. An existing AI job cannot
  execute safely until the deployment is explicitly configured with
  `AI_ENABLED=true`, `AI_PROVIDER=gemini`, and a currently available
  `AI_MODEL`.
- Current result: **FOUNDER INPUT REQUIRED — protected Gemini runtime
  enablement/model selection. The configured key was never read or logged.
  Non-blocking to the WebMCP release.**

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
