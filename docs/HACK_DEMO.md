# HACK-DEMO — From first workspace to completed project

**Script v2 · September 3, 2026 · target 2:50. Partial UI footage captured; final recording incomplete.**

Owner: [HACK-DEMO #74](https://github.com/Jainil2/scopedelta/issues/74). Operator instructions: [runbook](HACK_DEMO_RUNBOOK.md). Recording status: [handoff](HACK_DEMO_STATE.md).

The founder's September 3 request replaces the seeded, four-tool-only storyboard with an end-to-end flow using the tools merged in [PR #77](https://github.com/Jainil2/scopedelta/pull/77). The verified merge commit is `a44b619153df508d8cc91e8a1a0f678524974919`. The founder reports the tools are available in production; this script is checked against that source, not a completed live rehearsal.

Live rehearsal found that the native browser rejects the all-at-once workspace registration. The founder approved a narrow compatibility fix: keep discovery/navigation and the original shortcuts available, and load one business workflow through `discover_workflows.load` before using it. Refresh native tools after selection. Local native registration and selection checks are separate from production execution; the reviewed fix must be deployed before recording those production scenes. The external NOVA Approver invitation is accepted.

## Environment answer

**No additional Netlify variables are required for this script. No database seed is required.** It uses the existing signed-in application and WebMCP workflow tools.

| Configuration                                                                 | What this demo needs                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing database and authentication                                          | The application's working configuration remains necessary. Sign-in and email verification happen through the ordinary account screens.                                                                                                                       |
| `WEBMCP_DEMO_ENABLE`, `WEBMCP_DEMO_JUDGE_EMAIL`, `WEBMCP_DEMO_JUDGE_PASSWORD` | Optional fixture-provisioning inputs. Adding them in Netlify does not itself run `webmcp:demo seed` or create a judge login. The fresh-workspace story does not use that fixture.                                                                            |
| Email / client access                                                         | Use an existing verified external client account and the ordinary private invitation flow. New signups or emailed invitations need the application's existing email service. A separate client session is an access prerequisite, not another demo variable. |
| Built-in AI analysis                                                          | Omitted from this cut. Adding it would require `AI_ENABLED=true`, `AI_PROVIDER`, `AI_MODEL`, and the chosen provider's secret or reachable Ollama endpoint. A browser agent calling WebMCP does not require an app-side AI provider key.                     |
| GitHub, billing and payments                                                  | Omitted from this cut; their provider configuration is not needed. The sample commercial quote below does not execute a payment.                                                                                                                             |

Do not add `WEBMCP_DEMO_RESET_CONFIRM` for this story. Do not publish credentials or add public-prefixed copies of them.

## Story and cast

**NOVA is a small, explicitly synthetic launch-scope review engagement.** Its deliverable is a reviewed checklist, so we can show real review work being finished without suggesting that software was built during a three-minute video.

The initial agreement covers retail checkout review and excludes wholesale discounts. The client requests a wholesale review. An agent identifies work without a commercial basis, helps the manager record and publish a paid-change decision, and creates accountable follow-up. The client approves the exact packet. The team reviews the checklist, records evidence, obtains delivery acceptance, and marks the project completed.

Minimum cast: one verified internal account, creating a fresh workspace as its owner and acting as project lead/reviewer; one separate verified external **approver** account. PM, contributor and commercial-manager labels describe perspectives, not new permission roles. Use a third contributor session only if it actually exists and has project access. Never label the owner's screen as an external client screen.

All names, scope text and the illustrative **USD 250** quote in the runbook are fictional demo data. No real customer project is needed. Start a new workspace such as **NOVA Demo Studio**, create **NOVA Retail** as the internal client account, then create project **NOVA — Launch scope review** with key `NOVA`.

## Shot order and spoken script

The voiceover below is a draft to reconcile with the rehearsal. Time ranges are edit allocations, not predicted API latency. Preserve causality, show real confirmations and outputs, and use a small **“Edited workflow”** caption when compressing setup or review work. Trim loading and navigation before trimming the commercial explanation.

### 1. The problem — 0:00–0:12

Show the empty workspace/setup screen. Introduce the ordinary product before focusing on the agent.

> A client asks for one more change. The team needs to know what was agreed, what changed, and who approved it. ScopeDelta connects those decisions to delivery.

### 2. Start from zero — 0:12–0:33

Prompt: **“Create a workspace called NOVA Demo Studio. Add NOVA Retail as our client and create NOVA, Launch scope review. Make me the lead.”**

Tools: `workspace_setup.create` → `client_accounts.create` → `project_lifecycle.create`. Show the initially empty project list, the actual creation results, and the new project in the ordinary Projects view. Reacquire tools after the workspace navigation.

> We start with an empty workspace. I ask the agent to add our client and create NOVA, with me as project lead. These are ordinary project records. The agent uses the same application as the team.

### 3. Establish the agreement and work — 0:33–0:53

Prompt: **“Use this agreed review scope to draft the baseline. Add the launch-review milestone and my retail-review task. Link that task to the agreed deliverable. Let me review before activating the baseline.”**

Tools: `commercial_evidence`, `commercial_agreement`, `commercial_scope`, `project_milestones`, `delivery_work`, `work_commercial_basis`; then **“What assigned work needs my attention?”** → `list_my_work`. Show evidence text, the activation confirmation, and the matching assigned task. Condense intermediate setup with an honest edit.

> Next, we record the agreed scope: review retail checkout and deliver a launch checklist. Wholesale discounts are excluded. I review and activate that baseline. The agent creates assigned work and links it to the agreed deliverable.

### 4. A client asks for more — 0:53–1:11

Cut to the separate client session. Prompt: **“In NOVA, request a review of wholesale discount rules for the launch checklist.”** → `client_requests.create`.

Cut back to the lead; use `delivery_work.create` and `work_commercial_basis.classify` to capture **Review wholesale discount rules** as client-delivery work awaiting commercial treatment. Show the same request in the internal Client collaboration screen. Do not create a second internal copy of the request.

> Now the client asks to include wholesale discount rules. Their request enters the same project record. The lead adds the review to planned work, but it still needs a commercial basis. Capturing a request does not approve it.

### 5. Hero moment: explain the gap — 1:11–1:41

Prompts: **“In project NOVA, find the wholesale discount work.”** → `search_work_items`; then **“Why is delivery drifting from the current commercial agreement in NOVA? Give me the factual category counts and affected work.”** → `get_commercial_drift`.

Hold the real result and ordinary Commercial ledger together long enough to read. In the clean runbook state, retail is linked and wholesale is commercially unlinked. Narrate only observed results; the old fixture's five counts of one do not apply.

> I ask the agent why delivery is drifting. The retail review has an agreed basis; the wholesale review does not. The Commercial screen shows the same facts. ScopeDelta also distinguishes stale agreement links, unclassified work, and internal support. These are recorded delivery facts. The agent helps us understand the gap; the manager chooses how to handle it.

### 6. Human decision, client approval, accountable follow-up — 1:41–2:04

Prompt: **“Prepare the wholesale review as a paid change using our demo quote. Let me review the decision and client packet. Create a high-priority work item titled ‘Confirm wholesale change-order review’ and assign it to me.”**

Tools: `commercial_decisions.record` with a confirmed illustrative impact → `client_request_review.publish_packet` → original `create_work_item`. Show manager confirmation and the ordinary follow-up item. Cut to the client reviewing and confirming `client_packet_response.respond` for that exact packet. Back with the lead, link wholesale work to the recorded decision using `work_commercial_basis.link` and verify the changed ledger while the work is still active.

> The manager reviews a paid-change decision and the client-facing quote. The client approves that exact packet. The agent creates an assigned follow-up and connects the wholesale work to the recorded decision. Approval, work, and commercial history remain traceable.

### 7. Review and accept the deliverable — 2:04–2:28

Show the actual checklist review and a short **“Review complete”** transition. Use `project_notes`, `work_discussion`, `qa_verification.record`, and `delivery_work.update` to retain the review findings and finish the work. Record actual review time with `time_tracking` if measured. Complete the milestone, publish its client-safe summary with `client_publication`, and publish an acceptance target with `client_acceptance_publication`.

Cut to the client reviewing the published checklist summary and confirming `client_delivery_acceptance.respond`. The runbook gives the exact order; do not change the milestone after publishing its acceptance snapshot.

> The team reviews the checklist, records what was checked, and finishes the work. The client receives a published delivery summary and accepts that version. Commercial approval and delivery acceptance are separate records, so an approved change is never mistaken for completed delivery.

### 8. Complete the project — 2:28–2:44

Prompt: **“Show NOVA's delivery and acceptance state. If the review is complete, ask me to confirm marking the project completed.”** → `project_lifecycle.read`, relevant delivery/client reads, then `project_lifecycle.update` with `lifecycle: "completed"` after the human review. Show the completed project in the Projects filter. This is a deliberate manager action; the API does not infer completion from acceptance.

> Finally, the lead checks the delivery and acceptance records, then confirms project completion. NOVA remains in the completed-project view with its history. We have gone from an empty workspace to a finished engagement.

### 9. Close — 2:44–2:50

Hold the completed project and product name.

> ScopeDelta keeps delivery tied to the agreement, from the first project to the final review.

## Coverage and edit decisions

This cut demonstrates a complete engagement, not every available workflow. The [catalog](workflows/README.md) documents all **55 business workflow tools** and **156 direct API operations**, plus discovery and human handoffs. Those are source coverage counts, not a claim that all ran in this video. Registration depends on the current workspace, setup or client surface.

The four original shortcuts remain in the story: `list_my_work` (scene 3), `search_work_items` and `get_commercial_drift` (scene 5), and `create_work_item` (scene 6). New tools supply setup, evidence, agreement, client participation, decisions, delivery, acceptance and project completion. Archive/reopen/restore are available as an optional rehearsal appendix, not part of the timed cut.

A baseline source upload alone is not an effective agreement. A paid-change decision alone is not client approval or payment. Linking that decision to work does not create a baseline amendment. Recording QA is not proof unless the stated check happened. Project completion does not delete the project or close the workspace.

## Recording readiness and alternatives

The client session and NOVA setup are verified, and partial ordinary-UI footage exists. Native production execution awaits the registration fix's review and deployment. Reconcile the remaining scenes and narration with real outcomes. Prefer the connected in-app browser; use Chrome only if its WebMCP connection is available. Enter credentials outside capture.

If no separate verified client approver is available, continue preparing the internal setup and commercial shots. Use the runbook's internal-only variant for a draft: show **Awaiting client approval**, not a fabricated approval or completed engagement. The full end-to-end recording still needs the client session. Adding another environment variable will not supply that session.

Rehearse once, correct the voiceover against observed facts, and capture genuine tool results with their matching ordinary UI. On an uncertain write, inspect state before retrying. Preserve the rehearsed project and name subsequent takes explicitly; do not reset a shared workspace for convenience.

Final deliverables remain `HACK-DEMO.mp4` in the repository root and `HACK-DEMO.srt`: readable 16:9 footage, proposed 1920×1080 H.264/AAC at 30 fps, intelligible narration and synchronized captions, under 180 seconds. The existing 2:48 v1 narration is obsolete. Replacement v2 voice segments and initial UI footage are prepared; final editing, public upload and submission remain outstanding.
