# Templates, CSV Migration, and Core Delivery Export

SC-011B is a Local/LAN adoption path for workspace owners and admins. It does not call Jira, ScopeDelta Cloud, AI providers, or attachment URLs.

## Project templates

Open **Adoption → Templates** to create a versioned project standard. A definition may contain:

- default project context;
- milestone names and target offsets from the new project's start date;
- cycle names, start offsets, and durations;
- top-level work and one subtask level;
- acceptance criteria, fixed ScopeDelta status/priority/purpose, point estimates, target offsets, milestone/cycle references, and labels.

Applying a template is atomic and records the exact template version and copied definition. Editing a template creates a new version; it never changes a previously created project.

## CSV import stages

1. Choose **Jira CSV** or **Generic CSV**.
2. Provide a stable source namespace, such as `jira-acme-cloud`. Keep using that namespace for retries/re-exports from the same source.
3. Choose the destination client and default project lead. Optionally supply a fallback project key/name when the CSV omits them.
4. Select a local CSV and, for generic input or exceptions, provide explicit `destination=CSV header` plus status/priority value mappings.
5. Create the dry-run preview. No delivery state is created.
6. Inspect valid, warning, and blocked rows; unsupported columns; and unresolved assignee/reporter identities.
7. Optionally map a source identity to an existing workspace member. Leaving it unresolved grants no access.
8. Confirm. Existing source objects are skipped; ScopeDelta never title-deduplicates or silently overwrites them.

Limits per preview:

| Boundary            |             Limit |
| ------------------- | ----------------: |
| UTF-8 CSV body      |              5 MB |
| Data rows           |             5,000 |
| Columns             |                64 |
| One field           | 10,000 characters |
| Commit batch        |          100 rows |
| Row detail response |     100 rows/page |

Larger exports should be split into stable source batches. A durable session records whether anything committed and the created/skipped/failed outcome for every row. Failed later batches can be retried; committed source identities are skipped safely.

## Supported mapping fields

Generic mapping destinations are:

`projectKey`, `projectName`, `issueKey`, `title`, `description`, `acceptanceCriteria`, `issueType`, `status`, `priority`, `assignee`, `reporter`, `parentKey`, `labels`, `createdAt`, `updatedAt`, `dueDate`, `estimatePoints`, and `sourceUrl`.

The Jira preset recognizes common Jira variants of Project/Space key and name, Issue key, Summary, Description, Issue Type, Status, Priority, Assignee, Reporter, Parent, Labels, Created, Updated, Due date, Story Points, and Issue URL.

Default Jira status mapping:

| Jira value                      | ScopeDelta  |
| ------------------------------- | ----------- |
| Backlog, Open, To Do            | Backlog     |
| Ready, Selected for Development | Ready       |
| In Progress                     | In progress |
| In Review, Code Review          | In review   |
| Resolved, Closed, Done          | Done        |
| Canceled/Cancelled, Won't Do    | Canceled    |

Unknown statuses are blocking until explicitly mapped. Unknown priorities are reported and remain `none`. Only integer point estimates from 1–100 are imported; time estimates are not converted to points or staffing hours. Compatible due dates become work target dates; source created/updated timestamps remain migration metadata rather than rewriting ScopeDelta audit timestamps.

Unsupported populated columns are named in the report. Up to 20 bounded non-empty values per row are preserved as source metadata, not applied as new workflow/custom fields.

## Hierarchy and identity

The source identity is scoped by workspace, source kind, namespace, source project key, and source object key. Source project and object keys compare case-insensitively while retaining their imported display form. Identical issue keys in different source projects are valid. Missing keys use the exact file fingerprint plus row number as a durable fallback and are explicitly warned. Retrying the exact file therefore deduplicates, while a different batch in the same stable namespace does not collide merely because it uses the same row numbers.

ScopeDelta supports one parent/subtask level. Parent rows may appear after children. Missing parents, duplicate keys inside one project, circular/self parents, and deeper hierarchies block only the affected rows and remain inspectable.

Assignees/reporters are unresolved source identities by default, and each preview retains its own association to every identity it observed. Import never creates accounts, workspace membership, invitations, or privileges. An explicit admin mapping may use an existing workspace member and add that member only to the imported project.

## Core delivery CSV export

Open **Adoption → Export** or call:

`GET /api/v1/workspaces/{workspaceId}/exports/delivery-core`

Optional query parameters:

- `projectId` — export one accessible workspace project;
- without `projectId`, `page` and `pageSize` select a maximum of 25 projects;
- with `projectId`, `page` selects a deterministic record part of at most 5,000 rows;
- `includeArchived=true` — include archived projects/work.

The CSV is UTF-8 and contains typed `client`, `project`, `milestone`, `cycle`, and `work_item` records. Text beginning with `=`, `+`, `-`, or `@` is prefixed with an apostrophe so spreadsheet applications do not execute it as a formula. The response is private/no-store and includes current-page, total-pages, and has-more headers. Single-project filenames include `part-N-of-M`; increment `page` until all deterministic parts are downloaded. Each part repeats the client/project identity rows so the set can be reconstructed independently.

Every row states `core_delivery_not_legal_audit`. This export is enough to reconstruct core delivery structure and source references, but it is intentionally not a full commercial document, client-action, engineering/QA evidence, legal, retention, or audit archive.

## Security notes

- Only workspace owners/admins can use these APIs and screens.
- External participants and cross-workspace actors receive the safe not-found boundary.
- Imported markup/scripts are inert text; no remote attachment or source URL is fetched.
- Audit/log records contain structured identifiers, counts, and error codes—not CSV bodies or descriptions.
- Filenames are reduced to bounded basename text and never used as filesystem paths.

See `docs/decisions/ADR-014-template-migration-portability-boundary.md` for the durable architecture decision.
