# Using ScopeDelta workflow tools

Start at **Agent workflows** in the workspace sidebar. The page is usable even without WebMCP support. A compatible browser agent discovers the tools available on the current page.

## First user, without demo data

1. The person creates an account, verifies email, and signs in normally. Public `account_access` tools can open these screens, but cannot enter credentials.
2. On `/onboarding`, call `workspace_setup` with `{"action":"create","data":{"name":"Acme Studio"}}`. The app opens the created workspace.
3. Call `client_accounts` with `{"action":"create","data":{"name":"Acme"}}`.
4. Use that returned client ID in `project_lifecycle`: `{"action":"create","data":{"clientId":"<returned UUID>","key":"WEB","name":"Website launch"}}`. The lead defaults to the signed-in user; an explicit authorized lead ID is also supported.
5. Use the returned project ID with `delivery_work.create` to create tasks. Plan milestones/cycles, assign people, discuss work, and record time through their corresponding flow tools.
6. Review QA evidence, update work to `done`, then call `project_lifecycle.update` with `data.lifecycle` set to `completed`. The person confirms completion in ScopeDelta. `list` with `filters.lifecycle: "completed"` finds the project again; `active` reopens and `archived` archives under existing rules.

Example prompt: “Set up Acme as a client and Website launch as project WEB. Make me the lead. Add a kickoff task, then show me what to do next.”

## Finding and executing a flow

Before each new business workflow in the sequence above, call `discover_workflows` with `{"load":"<workflow name>"}`, refresh the browser's available tools, then call that workflow. For example, load `workspace_setup` before creating the workspace, then load `client_accounts` on the resulting workspace page. Loading replaces the previous business workflow; its action names and schemas remain unchanged. Switching actions within the same loaded workflow does not require another load.

`discover_workflows` also accepts an optional `query` such as `"commercial"` or `"time_tracking"` to find every workflow allowed on the current surface. Discovery without `load` does not change registration. The four original workspace shortcuts and the lightweight navigation/handoff tools stay available. Workspace pages register ten base tools and at most one business tool; other surfaces register six base tools and at most one business tool. This avoids sending the entire business schema catalog to the browser at once.

Each business tool has an `action` selector; `data` contains write fields, `filters` contains list filters, and IDs are separate route fields such as `projectId` and `workItemId`. Use authorized list/read results for IDs. The workspace is fixed by the current document. A canceled or replaced tool must be discovered again; never retry an uncertain write merely because the tool selection changed.

`open_workflow` opens a named ordinary screen. Project destinations such as `board`, `commercial`, `engineering` or `ai` also require a returned project key. It never accepts arbitrary URLs.

Consequential actions pause at **Review agent action**. Canceling leaves the action unapplied. The agent must not represent a `human_step_required`, `invalid_input`, `rejected`, `not_applied` or `outcome_unknown` result as success. After an uncertain write, inspect the existing record/history before any retry. Supply and retain an explicit idempotency key when planning to resume a particular request.

Source evidence can be added with `commercial_evidence.add_text`, using ordinary Unicode `data.text` and a name. PDF/DOCX uploads use the existing `add_source` contract. `read_source` returns `textOffset`, `nextTextOffset` and `totalTextCharacters`; use `nextTextOffset` for the next excerpt rather than treating a partial source as complete.

Client invitations with `data.sendEmail: true` send through the configured email service after confirmation. Omitting it opens the ordinary Client collaboration screen for private-link creation. Invitation secrets never appear in tool results.

## Runtime and deployment

These browser tools need no additional Netlify environment values. Existing database, authentication, email, billing, GitHub and AI configuration still controls the corresponding services. An unset provider cannot be made usable just by registering its workflow tool.

`WEBMCP_DEMO_ENABLE`, `WEBMCP_DEMO_JUDGE_EMAIL`, and `WEBMCP_DEMO_JUDGE_PASSWORD` belong to the optional demo provisioning script. They are not needed for a judge who signs up and creates their own workspace. Do not use an invented shared password or publish a real judge credential in the repository.

The catalog becomes available on the deployed site after the reviewed branch passes the required merge gate and is deployed. Local implementation does not change the current Netlify deployment.
