# ScopeDelta interaction and workflow inventory

Owner: [WEBMCP-002 #76](https://github.com/Jainil2/scopedelta/issues/76). Regenerate with `pnpm exec tsx scripts/workflow-inventory.ts`.

The current source contains **620 application control declarations** and **171 API method/route operations**. The catalog defines **55 business workflow tools**, alongside discovery/navigation and the four compatible original tools.

- [Every button, form, link, field and interaction](interaction-inventory.csv): source file/line, containing component, label or dynamic expression, handler, category and related flows.
- [Every API operation and its use](api-coverage.csv): tool/action mapping or explicit provider/native/human boundary.

Counts describe source declarations, not the number of controls visible to a particular role. Dynamic lists instantiate controls per record; shared UI primitives and tests are excluded. Navigation, filtering, disclosures, selection and keyboard controls support their containing flow rather than becoming unrelated mutation tools. Source expressions are retained when labels vary with state.

The workflow tools directly invoke **156 API operations**. 3 billing/provider operations continue in their ordinary UI; the other 12 declared operations are identified credential, invitation, native, callback or public-form boundaries. There are also six discovery/navigation/handoff tools and four compatible original shortcuts. See [first-user usage](USAGE.md), [authorization rules](../AUTHORIZATION_MATRIX.md), and [validation evidence](EVIDENCE.md).

## Categories and functional flows

### Getting started

| Flow / tool            | Functional requirement                                                                                            | Actions                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `workspace_setup`      | List your workspaces or create one. After creating, open its returned workspace URL before using workspace tools. | `list`, `create`        |
| `workspace_onboarding` | Read authoritative activation progress and dismiss or restore the setup guide.                                    | `read`, `set_dismissed` |

### Administration

| Flow / tool             | Functional requirement                                                                                                                                                  | Actions                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `workspace_settings`    | Update the workspace name and IANA time zone as its owner.                                                                                                              | `update` (confirm)                                                  |
| `workspace_members`     | Find people and their user/membership IDs; change role, suspend, reactivate, or remove access under existing owner/admin rules.                                         | `update_access` (confirm), `remove` (confirm), `list`               |
| `workspace_invitations` | List, send, revoke or reissue invitations. Invitation secrets stay in the ordinary Members UI.                                                                          | `reissue` (confirm), `revoke` (confirm), `list`, `invite` (confirm) |
| `workspace_lifecycle`   | Read, submit or cancel owner closure/deletion intent with the existing typed name and retention/export acknowledgements. The tool does not execute operator purge jobs. | `cancel` (confirm), `list`, `request` (confirm)                     |
| `workspace_billing`     | Read owner billing state. Continue checkout or billing portal changes in the ordinary billing UI; payment details and provider authorization remain human-controlled.   | `checkout` (human step), `portal` (human step), `read`              |

### Delivery

| Flow / tool          | Functional requirement                                                                                                                                                                       | Actions                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `client_accounts`    | List, create, read, edit, archive or restore internal client accounts. Create an active client before creating a project.                                                                    | `read`, `update` (confirm), `list`, `create`               |
| `project_lifecycle`  | List all lifecycle states, create a project for an active client, read its context, update details, or set lifecycle to completed, archived or active. Omitted leadUserId defaults to you.   | `read`, `update` (confirm), `list`, `create`               |
| `project_members`    | List, add or remove existing workspace members from the project; find mentionable people. Access changes require confirmation.                                                               | `remove` (confirm), `list`, `add` (confirm), `mentionable` |
| `project_milestones` | List, create or update milestones, dates and planned/in_progress/completed/archived status.                                                                                                  | `update`, `list`, `create`                                 |
| `delivery_cycles`    | List, create and update delivery cycles, date ranges, goals and lifecycle.                                                                                                                   | `update`, `list`, `create`                                 |
| `delivery_work`      | List or read work; create and update title, status, priority, assignee, estimate, dates, cycle, milestone and labels; reorder the board or archive an item. IDs come from list/read actions. | `reorder`, `read`, `update`, `list`, `create`              |
| `work_dependencies`  | Read project/work-item dependencies, add a blocker, or remove a dependency. The server prevents invalid/cyclic relationships.                                                                | `remove` (confirm), `list_project`, `add`                  |
| `project_labels`     | List or create labels used by delivery work.                                                                                                                                                 | `list`, `create`                                           |
| `assigned_work`      | Read your assigned work with pagination and the full ordinary My Work filters. Use list_my_work for a compact attention summary.                                                             | `list`                                                     |

### Collaboration

| Flow / tool         | Functional requirement                                                                                                                               | Actions                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `work_discussion`   | List, read, post, edit or delete internal work comments and inspect edit history. Mentions and subscriptions use the existing collaboration service. | `history`, `read`, `edit`, `delete` (confirm), `list`, `post` |
| `work_subscription` | Read or change your subscription to a work item.                                                                                                     | `read`, `update`                                              |
| `project_notes`     | List, create, read, edit or archive internal project notes.                                                                                          | `read`, `update`, `list`, `create`                            |
| `project_activity`  | Read paginated authoritative project or work-item activity.                                                                                          | `project`, `work_item`                                        |
| `workspace_inbox`   | Read internal notifications, mark selected notifications read/unread, or mark a client-collaboration notification read.                              | `mark_client_read`, `list`, `mark_read`                       |

### Commercial

| Flow / tool                 | Functional requirement                                                                                                                                                                      | Actions                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `commercial_evidence`       | Read commercial context and source text, add a pasted-text/PDF/DOCX source, retry extraction, or download its original. Sources do not themselves establish an effective agreement.         | `overview`, `download_source`, `retry_extraction`, `read_source`, `add_text`, `add_source` |
| `commercial_scope`          | Create or revise a scope item using exact source evidence offsets; archive or restore draft scope items. Read commercial_evidence.overview to discover versions and items.                  | `set_archived`, `revise`, `create`                                                         |
| `commercial_agreement`      | Create an initial baseline or draft amendment from source evidence, then activate an exact version with human confirmation. Use commercial_evidence.overview to read the existing baseline. | `create_baseline` (confirm), `activate_version` (confirm), `create_amendment` (confirm)    |
| `commercial_requests`       | List, record, inspect or change the open/needs_clarification/withdrawn state of commercial requests. Decisions use commercial_decisions.                                                    | `read`, `update_state`, `list`, `create`                                                   |
| `commercial_clarifications` | Read AI-produced internal clarification drafts and mark a draft resolved or dismissed. This does not publish to a client.                                                                   | `update`, `list`                                                                           |
| `commercial_decisions`      | Record a covered, absorbed, swap, paid_change, deferred or rejected decision with evidence and human confirmation; supersede existing decisions explicitly.                                 | `record` (confirm)                                                                         |
| `commercial_impact`         | Record or supersede effort, schedule and monetary impact estimates/confirmed values with evidence. This is not billing or payment execution.                                                | `record` (confirm)                                                                         |
| `work_commercial_basis`     | Read work purpose and basis links, classify work, link a scope revision or decision, or remove a basis link. The server computes drift.                                                     | `unlink` (confirm), `link`, `read`, `classify`                                             |
| `commercial_drift_ledger`   | Read paginated drift categories, the combined summary or immutable commercial history. Advisory facts never imply a legal or commercial verdict.                                            | `ledger`, `summary`, `history`                                                             |

### Client collaboration

| Flow / tool                     | Functional requirement                                                                                                                                         | Actions                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `client_publication`            | Read the client collaboration overview, update its public summary, publish milestone/deliverable items or withdraw an item. Publication requires human review. | `withdraw_item` (confirm), `publish_item` (confirm), `overview`, `update_summary` (confirm)                                            |
| `client_participants`           | List, invite, change collaborator/approver role, revoke participation or manage invitations. Invitation URLs stay in the application UI.                       | `reissue_invitation` (confirm), `revoke_invitation` (confirm), `update_role` (confirm), `revoke` (confirm), `list`, `invite` (confirm) |
| `client_request_review`         | Request clarification or update request state; publish an exact commercial decision packet for client review. Read client_publication.overview first.          | `publish_packet` (confirm), `update_state` (confirm)                                                                                   |
| `client_acceptance_publication` | Publish an immutable acceptance target for an existing client-visible project item and linked packets.                                                         | `publish` (confirm)                                                                                                                    |
| `client_team_discussion`        | Post a client-visible message on an exact request, packet or acceptance target after reviewing its audience.                                                   | `post` (confirm)                                                                                                                       |

### External client

| Flow / tool                  | Functional requirement                                                                                                                                          | Actions                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `client_project_access`      | List your authorized client projects or read a project projection, requests, packets, discussion and acceptance targets. No internal workspace data is exposed. | `read`, `list`                               |
| `client_requests`            | Record a new request in an authorized client project. Read client_project_access for current state.                                                             | `create`                                     |
| `client_discussion`          | Post a message on a published request, packet or acceptance target you may access.                                                                              | `post` (confirm)                             |
| `client_packet_response`     | An authorized client approver can approve, reject or request clarification on an exact published packet, only after human confirmation.                         | `respond` (confirm)                          |
| `client_delivery_acceptance` | An authorized client approver can accept an exact published delivery target or request changes, after human confirmation.                                       | `respond` (confirm)                          |
| `client_inbox`               | List client notifications, mark one read, or explicitly retry a failed email delivery.                                                                          | `mark_read`, `retry_email` (confirm), `list` |

### Engineering & QA

| Flow / tool                | Functional requirement                                                                                                                                    | Actions                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `engineering_evidence`     | Read engineering context and work-item traces; link or unlink implementation evidence. Provider consent is completed in the ordinary Engineering UI.      | `unlink` (confirm), `link`, `overview`, `trace`                       |
| `engineering_repositories` | Start the GitHub connection in the existing consent UI, reconcile a connected repository, or disconnect it. Provider secrets are never tool input/output. | `connect` (human step), `reconcile` (confirm), `disconnect` (confirm) |
| `qa_verification`          | Read readiness coverage and record explicit QA verification evidence. A work status change alone is not QA evidence.                                      | `readiness`, `record` (confirm)                                       |
| `delivery_defects`         | Create defects with reproduction context and resolve/reopen them under existing QA rules. Read engineering_evidence.overview for defects.                 | `update_status`, `create`                                             |

### AI assistance

| Flow / tool           | Functional requirement                                                                                                                                                                                                              | Actions                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ai_analysis`         | List/read jobs, start scope-change analysis, a delivery risk brief or work context/QA pack, cancel or explicitly retry. Requires configured AI; start/retry may send authorized context to the configured provider and incur usage. | `cancel` (confirm), `retry` (confirm), `read`, `list`, `start` (confirm) |
| `ai_candidate_review` | Preview selected scope-analysis candidates, then apply the exact fingerprint/selection with human confirmation. Never silently publish or accept AI output.                                                                         | `confirm` (confirm), `preview`                                           |

### Operations

| Flow / tool           | Functional requirement                                                                                                               | Actions                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `portfolio_review`    | Read the authorized portfolio filtered by client, person, lifecycle and attention signal.                                            | `read`                                                  |
| `capacity_planning`   | Read capacity, set workspace default availability or a member availability effective from an explicit Monday.                        | `set_default` (confirm), `set_member` (confirm), `read` |
| `project_allocations` | List, create, update or remove weekly project allocations with explicit people, dates and minutes.                                   | `update`, `remove` (confirm), `list`, `create`          |
| `time_tracking`       | List, record, edit or void actual work time and its billable/non_billable classification. Does not issue invoices or accept payment. | `update`, `void` (confirm), `list`, `create`            |
| `commercial_exposure` | Read restricted workspace or project commercial exposure using authoritative evidence and existing authorization.                    | `workspace`, `project`                                  |

### Adoption & portability

| Flow / tool         | Functional requirement                                                                                                                                                    | Actions                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `project_templates` | List, create, inspect, update or archive templates; apply one to create a normal project for an existing client.                                                          | `apply`, `read`, `update`, `archive` (confirm), `list`, `create`               |
| `delivery_import`   | List import sessions, preview generic/Jira CSV mapping, inspect row errors and identities, then confirm a reviewed import. Use skip_existing duplicate handling.          | `confirm` (confirm), `read`, `preview`, `list`                                 |
| `workspace_exports` | Create an owner-only operational export, inspect its manifest, download a selected archive part, or download paginated core delivery CSV. Exports are not legal archives. | `download_part` (confirm), `read`, `download_delivery_csv`, `create` (confirm) |

## Navigation and human handoffs

`discover_workflows` finds relevant actions. `open_workflow` navigates to a fixed ordinary screen, with an explicit project key for project screens.

| Flow / tool           | Requirement                                                                                                                                                                          | Actions                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `account_access`      | Open sign-in, registration, password recovery or email-verification status. The person enters their credentials and completes verification.                                          | sign_in, sign_up, recover_password, verification |
| `invitation_access`   | Open the invitation screen for an already-staged invitation. Ask the person to open the private link from their email if no invitation is staged; never request or return its token. | workspace, client                                |
| `desktop_preferences` | Explain how to continue notification permissions, external sign-in and local preferences in the native ScopeDelta desktop app. Browser tools cannot change native preferences.       | instructions                                     |
| `pilot_interest`      | Open the public pilot form for the person to review and submit their contact details and requirements.                                                                               | open_form                                        |

Workspace pages register the original four tools, discovery/navigation and four handoff tools. `discover_workflows` lists all workflows allowed on the current surface; `{"load":"<workflow name>"}` registers one business tool, replacing the previous selection. Refresh native tools after loading. Setup pages can load workspace setup; authenticated client pages can load only client projection flows. Public account pages expose only discovery/navigation/handoffs. The registered set contains at most eleven tools on workspace pages and seven elsewhere; all 55 business workflows remain discoverable on their authorized surfaces.

## Complete work sequences

1. **First-time delivery:** sign in → workspace_setup.create → client_accounts.create → project_lifecycle.create → project_milestones / delivery_cycles → delivery_work.create/update → qa_verification → project_lifecycle.update (completed).
2. **Commercial change:** commercial_evidence → commercial_agreement draft → commercial_scope → activate agreement → work_commercial_basis → commercial_requests → commercial_impact → commercial_decisions → amendment → commercial_drift_ledger.
3. **Client collaboration:** client_participants → client_publication → external client_project_access / client_requests → client_request_review / client_team_discussion → publish packet → client_packet_response → client_acceptance_publication → client_delivery_acceptance.
4. **Engineering and QA:** engineering_repositories → engineering_evidence → qa_verification → delivery_defects → verification and readiness review.
5. **AI assistance:** ai_analysis.start → read completed job → ai_candidate_review.preview → human confirmation → confirm → ordinary delivery/clarification records.
6. **Agency operations:** portfolio_review → capacity_planning → project_allocations → time_tracking → commercial_exposure.
7. **Reuse and portability:** project_templates → delivery_import.preview/read → human confirmation → confirm → workspace_exports.
8. **Administration:** workspace_members / workspace_invitations → workspace_settings / workspace_onboarding → workspace_billing → workspace_exports → workspace_lifecycle request/cancel.

## Boundaries

Credential entry, staged invitation tokens, provider OAuth consent, payment completion, native desktop preferences, and public pilot applications retain their existing human UI. Signed webhooks and OAuth callbacks are infrastructure transport and cannot become general agent commands. Browser tools never execute operator purge jobs. The server remains authoritative for roles, tenancy, entitlements, stale versions and evidence.
