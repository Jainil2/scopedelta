"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import type { ProjectTemplateDefinition, WorkspaceRole } from "@/db/schema";

type Member = {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
};
type Client = { id: string; name: string; lifecycle: string };
type Project = { id: string; key: string; name: string; lifecycle: string };
type Template = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  definition: ProjectTemplateDefinition;
};
type ImportSummary = {
  id: string;
  sourceKind: string;
  sourceName: string;
  fileName: string;
  state: string;
  totalRows: number;
  createdProjects: number;
  createdWorkItems: number;
  skippedRows: number;
  failedRows: number;
  committedAnything: boolean;
  createdAt: string | Date;
};
type ImportMessage = { code: string; message: string; field?: string };
type ImportResult = ImportSummary & {
  sourceNamespace: string;
  validRows: number;
  warningRows: number;
  blockedRows: number;
  unsupportedColumns: string[];
  lastErrorCode: string | null;
  rows: Array<{
    id: string;
    rowNumber: number;
    sourceProjectKey: string;
    sourceObjectKey: string;
    outcome: string;
    normalizedData: Record<string, unknown>;
    messages: ImportMessage[];
    targetProjectId: string | null;
    targetWorkItemId: string | null;
  }>;
  identities: Array<{
    id: string;
    identityKey: string;
    displayName: string | null;
    email: string | null;
    mappedUserId: string | null;
  }>;
  rowPageInfo: {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
  };
};

type ApiResult<T> =
  | { data: T }
  | { error: { message: string; fieldErrors?: Record<string, string[]> } };

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const result = (await response.json()) as ApiResult<T>;
  if (!response.ok || "error" in result) {
    throw new Error(
      "error" in result ? result.error.message : "The request failed.",
    );
  }
  return result.data;
}

function formText(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function nullable(value: string) {
  return value || null;
}

export function AdoptionWorkspace({
  workspaceId,
  workspaceSlug,
  templates,
  imports,
  clients,
  projects,
  members,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  templates: Template[];
  imports: ImportSummary[];
  clients: Client[];
  projects: Project[];
  members: Member[];
}>) {
  const activeClients = clients.filter(
    (client) => client.lifecycle === "active",
  );
  const activeProjects = projects.filter(
    (project) => project.lifecycle === "active",
  );
  return (
    <div className="app-content adoption-page">
      <header className="app-page-header adoption-header">
        <div>
          <p className="app-eyebrow">Adoption safety</p>
          <h1>Standards, migration, and portability</h1>
          <p>
            Reuse an opinionated delivery setup, preview every imported row, and
            keep an open path back out. No preview creates project truth.
          </p>
        </div>
      </header>
      <nav className="operations-tabs" aria-label="Adoption sections">
        <a href="#templates">Templates</a>
        <a href="#import">CSV import</a>
        <a href="#history">Import history</a>
        <a href="#export">Export</a>
      </nav>
      <TemplateLedger
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        templates={templates}
        clients={activeClients}
        members={members}
      />
      <ImportComposer
        workspaceId={workspaceId}
        clients={activeClients}
        members={members}
      />
      <section className="adoption-section" id="history">
        <header>
          <p className="app-eyebrow">Durable evidence</p>
          <h2>Import history</h2>
          <p>
            Every preview and partial result remains inspectable and retryable.
          </p>
        </header>
        {imports.length ? (
          <div className="adoption-ledger" aria-label="Import history">
            {imports.map((item) => (
              <Link
                className="adoption-ledger-row"
                href={`/app/${workspaceSlug}/settings/adoption/imports/${item.id}`}
                key={item.id}
              >
                <div>
                  <strong>{item.sourceName}</strong>
                  <span>{item.fileName}</span>
                </div>
                <div>
                  <span className={`state-token state-${item.state}`}>
                    {humanize(item.state)}
                  </span>
                  <span>{item.totalRows} rows</span>
                  <span>
                    {item.createdProjects} projects · {item.createdWorkItems}{" "}
                    work items
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No import sessions"
            body="Preview a Jira or generic CSV to create the first durable migration report."
          />
        )}
      </section>
      <ExportLedger workspaceId={workspaceId} projects={activeProjects} />
    </div>
  );
}

function TemplateLedger({
  workspaceId,
  workspaceSlug,
  templates,
  clients,
  members,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  templates: Template[];
  clients: Client[];
  members: Member[];
}>) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [createdTemplates, setCreatedTemplates] = useState<Template[]>([]);
  const templateRows = [
    ...templates,
    ...createdTemplates.filter(
      (template) =>
        !templates.some((candidate) => candidate.id === template.id),
    ),
  ];

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending("create-template");
    setMessage("");
    try {
      const template = await apiRequest<Template>(
        `/api/v1/workspaces/${workspaceId}/project-templates`,
        {
          method: "POST",
          body: JSON.stringify(templatePayload(data)),
        },
      );
      setCreatedTemplates((current) => [...current, template]);
      form.reset();
      setMessage(
        "Template created. Applying it will copy this version into a new project.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create template.",
      );
    } finally {
      setPending("");
    }
  }

  async function updateTemplate(templateId: string, data: FormData) {
    setPending(`update-${templateId}`);
    setMessage("");
    try {
      await apiRequest(
        `/api/v1/workspaces/${workspaceId}/project-templates/${templateId}`,
        { method: "PATCH", body: JSON.stringify(templatePayload(data)) },
      );
      setMessage(
        "A new template version was saved. Existing projects were not changed.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update template.",
      );
    } finally {
      setPending("");
    }
  }

  async function archiveTemplate(templateId: string) {
    setPending(`archive-${templateId}`);
    setMessage("");
    try {
      await apiRequest(
        `/api/v1/workspaces/${workspaceId}/project-templates/${templateId}`,
        { method: "DELETE" },
      );
      setMessage("Template archived. Applied project snapshots remain intact.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not archive template.",
      );
    } finally {
      setPending("");
    }
  }

  async function applyTemplate(templateId: string, data: FormData) {
    setPending(`apply-${templateId}`);
    setMessage("");
    try {
      const project = await apiRequest<{ key: string }>(
        `/api/v1/workspaces/${workspaceId}/project-templates/${templateId}/apply`,
        {
          method: "POST",
          body: JSON.stringify({
            clientId: formText(data, "clientId"),
            key: formText(data, "key").toUpperCase(),
            name: formText(data, "name"),
            summary: nullable(formText(data, "summary")),
            leadUserId: formText(data, "leadUserId"),
            startDate: nullable(formText(data, "startDate")),
            targetDate: nullable(formText(data, "targetDate")),
          }),
        },
      );
      router.push(`/app/${workspaceSlug}/projects/${project.key}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not apply template.",
      );
      setPending("");
    }
  }

  return (
    <section className="adoption-section" id="templates">
      <header>
        <p className="app-eyebrow">Repeatable standards</p>
        <h2>Project templates</h2>
        <p>
          Definitions evolve by version; projects receive immutable copied
          snapshots.
        </p>
      </header>
      <details className="adoption-composer">
        <summary>New project template</summary>
        <TemplateForm
          onSubmit={createTemplate}
          pending={pending === "create-template"}
        />
      </details>
      {templateRows.length ? (
        <div className="adoption-ledger">
          {templateRows.map((template) => (
            <details className="adoption-template" key={template.id}>
              <summary>
                <span>
                  <strong>{template.name}</strong>
                  <small>
                    {template.description || "No template description"}
                  </small>
                </span>
                <span>
                  v{template.version} · {template.definition.milestones.length}{" "}
                  milestones · {template.definition.workItems.length} work items
                </span>
              </summary>
              <div className="adoption-template-detail">
                <form
                  action={(data) => applyTemplate(template.id, data)}
                  className="adoption-form adoption-grid"
                >
                  <h3>Apply current snapshot</h3>
                  <ProjectFields clients={clients} members={members} />
                  <button type="submit" disabled={Boolean(pending)}>
                    {pending === `apply-${template.id}`
                      ? "Applying…"
                      : `Apply v${template.version}`}
                  </button>
                </form>
                <details>
                  <summary>Edit template definition</summary>
                  <TemplateForm
                    template={template}
                    onAction={(data) => updateTemplate(template.id, data)}
                    pending={pending === `update-${template.id}`}
                  />
                </details>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={Boolean(pending)}
                  onClick={() => archiveTemplate(template.id)}
                >
                  {pending === `archive-${template.id}`
                    ? "Archiving…"
                    : "Archive template"}
                </button>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No project templates"
          body="Create a reusable milestone and work-item skeleton for your next repeated delivery setup."
        />
      )}
      <output className="platform-status" aria-live="polite">
        {message}
      </output>
    </section>
  );
}

function TemplateForm({
  template,
  onSubmit,
  onAction,
  pending,
}: Readonly<{
  template?: Template;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onAction?: (data: FormData) => void;
  pending: boolean;
}>) {
  return (
    <form
      className="adoption-form adoption-grid"
      onSubmit={onSubmit}
      action={onAction}
    >
      {template ? (
        <input
          type="hidden"
          name="originalDefinition"
          value={JSON.stringify(template.definition)}
        />
      ) : null}
      <label>
        <span>Template name</span>
        <input
          name="name"
          defaultValue={template?.name}
          required
          minLength={2}
          maxLength={120}
        />
      </label>
      <label className="adoption-span">
        <span>Description</span>
        <textarea
          name="description"
          defaultValue={template?.description ?? ""}
          maxLength={2000}
          rows={2}
        />
      </label>
      <label className="adoption-span">
        <span>Default project context</span>
        <textarea
          name="projectSummary"
          defaultValue={template?.definition.projectSummary ?? ""}
          maxLength={5000}
          rows={3}
        />
      </label>
      <label className="adoption-span">
        <span>
          Milestones{" "}
          <small>One per line: ref | name | target offset days</small>
        </span>
        <textarea
          name="milestones"
          defaultValue={serializeMilestones(
            template?.definition.milestones ?? [],
          )}
          placeholder="discovery | Discovery complete | 14"
          rows={4}
        />
      </label>
      <label className="adoption-span">
        <span>
          Cycles{" "}
          <small>One per line: ref | name | start offset | duration days</small>
        </span>
        <textarea
          name="cycles"
          defaultValue={serializeCycles(template?.definition.cycles ?? [])}
          placeholder="cycle-1 | Cycle 1 | 0 | 14"
          rows={4}
        />
      </label>
      <label className="adoption-span">
        <span>
          Work items{" "}
          <small>
            ref | parent ref | title | acceptance criteria | milestone ref |
            cycle ref | labels
          </small>
        </span>
        <textarea
          name="workItems"
          defaultValue={serializeWorkItems(
            template?.definition.workItems ?? [],
          )}
          placeholder="brief | | Confirm delivery brief | Client goals are recorded | discovery | cycle-1 | discovery,client"
          rows={7}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : template
            ? "Save new version"
            : "Create template"}
      </button>
    </form>
  );
}

function ProjectFields({
  clients,
  members,
}: Readonly<{ clients: Client[]; members: Member[] }>) {
  return (
    <>
      <label>
        <span>Client</span>
        <select name="clientId" required>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Project key</span>
        <input name="key" pattern="[A-Za-z][A-Za-z0-9]{1,9}" required />
      </label>
      <label>
        <span>Project name</span>
        <input name="name" minLength={2} maxLength={160} required />
      </label>
      <label>
        <span>Lead</span>
        <select name="leadUserId" required>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Start date</span>
        <input name="startDate" type="date" />
      </label>
      <label>
        <span>Target date</span>
        <input name="targetDate" type="date" />
      </label>
      <label className="adoption-span">
        <span>Project-specific context override</span>
        <textarea name="summary" maxLength={5000} rows={2} />
      </label>
    </>
  );
}

function ImportComposer({
  workspaceId,
  clients,
  members,
}: Readonly<{ workspaceId: string; clients: Client[]; members: Member[] }>) {
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) {
      setMessage("Choose a CSV file first.");
      return;
    }
    setPending("preview");
    setMessage("");
    try {
      const sourceKind = formText(data, "sourceKind") as
        "generic_csv" | "jira_csv";
      const payload = {
        sourceKind,
        sourceNamespace: formText(data, "sourceNamespace"),
        sourceName: formText(data, "sourceName"),
        fileName: file.name,
        csvText: await file.text(),
        mapping: {
          columns: parsePairs(formText(data, "columnMappings")),
          statusValues: parsePairs(formText(data, "statusMappings")),
          priorityValues: parsePairs(formText(data, "priorityMappings")),
        },
        options: {
          clientId: formText(data, "clientId"),
          defaultLeadUserId: formText(data, "defaultLeadUserId"),
          defaultProjectKey: nullable(
            formText(data, "defaultProjectKey").toUpperCase(),
          ),
          defaultProjectName: nullable(formText(data, "defaultProjectName")),
        },
      };
      const previewResult = await apiRequest<ImportResult>(
        `/api/v1/workspaces/${workspaceId}/imports/preview`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      setResult(previewResult);
      setMessage(
        "Preview saved. Review blocking rows, unsupported columns, and identities before confirmation.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not preview this CSV.",
      );
    } finally {
      setPending("");
    }
  }

  return (
    <section className="adoption-section" id="import">
      <header>
        <p className="app-eyebrow">Preview before mutation</p>
        <h2>Jira-first and generic CSV import</h2>
        <p>
          Files are bounded to 5 MB, 5,000 rows, 64 columns, and 10,000
          characters per field. Direct Jira API access and attachment fetching
          are not used.
        </p>
      </header>
      <form className="adoption-form adoption-grid" onSubmit={preview}>
        <label>
          <span>Preset</span>
          <select name="sourceKind" defaultValue="jira_csv">
            <option value="jira_csv">Jira CSV</option>
            <option value="generic_csv">Generic CSV</option>
          </select>
        </label>
        <label>
          <span>Source namespace</span>
          <input
            name="sourceNamespace"
            placeholder="jira-acme-cloud"
            required
            maxLength={160}
          />
        </label>
        <label>
          <span>Source label</span>
          <input
            name="sourceName"
            placeholder="Jira active delivery export"
            required
            maxLength={160}
          />
        </label>
        <label>
          <span>CSV file</span>
          <input name="file" type="file" accept=".csv,text/csv" required />
        </label>
        <label>
          <span>Destination client</span>
          <select name="clientId" required>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Default project lead</span>
          <select name="defaultLeadUserId" required>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Fallback project key</span>
          <input name="defaultProjectKey" pattern="[A-Za-z][A-Za-z0-9]{1,9}" />
        </label>
        <label>
          <span>Fallback project name</span>
          <input name="defaultProjectName" minLength={2} maxLength={160} />
        </label>
        <details className="adoption-span adoption-mapping">
          <summary>Explicit column and value mapping</summary>
          <label>
            <span>
              Columns{" "}
              <small>destination=CSV header, comma or newline separated</small>
            </span>
            <textarea
              name="columnMappings"
              placeholder="projectKey=Project key, issueKey=Issue key, title=Summary"
              rows={4}
            />
          </label>
          <label>
            <span>
              Status values <small>source=ScopeDelta status</small>
            </span>
            <textarea
              name="statusMappings"
              placeholder="Open=backlog, In Progress=in_progress, Done=done"
              rows={3}
            />
          </label>
          <label>
            <span>
              Priority values <small>source=none|low|medium|high|urgent</small>
            </span>
            <textarea
              name="priorityMappings"
              placeholder="Highest=urgent, High=high, Medium=medium, Low=low"
              rows={3}
            />
          </label>
        </details>
        <button type="submit" disabled={Boolean(pending)}>
          {pending === "preview"
            ? "Parsing bounded preview…"
            : "Create dry-run preview"}
        </button>
      </form>
      <output className="platform-status" aria-live="polite">
        {message}
      </output>
      {result ? (
        <ImportLedger
          workspaceId={workspaceId}
          result={result}
          members={members}
          onResult={setResult}
        />
      ) : null}
    </section>
  );
}

export function ImportResultWorkspace({
  workspaceId,
  workspaceSlug,
  initialResult,
  members,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  initialResult: ImportResult;
  members: Member[];
}>) {
  const [result, setResult] = useState(initialResult);
  return (
    <div className="app-content adoption-page">
      <header className="app-page-header adoption-header">
        <div>
          <p className="app-eyebrow">Migration evidence</p>
          <h1>{result.sourceName}</h1>
          <p>
            {result.fileName} · source namespace {result.sourceNamespace}
          </p>
        </div>
        <Link
          className="button-secondary"
          href={`/app/${workspaceSlug}/settings/adoption`}
        >
          Back to adoption
        </Link>
      </header>
      <ImportLedger
        workspaceId={workspaceId}
        result={result}
        members={members}
        onResult={setResult}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
}

function ImportLedger({
  workspaceId,
  result,
  members,
  onResult,
  workspaceSlug,
}: Readonly<{
  workspaceId: string;
  result: ImportResult;
  members: Member[];
  onResult: (result: ImportResult) => void;
  workspaceSlug?: string;
}>) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [identityMappings, setIdentityMappings] = useState<
    Record<string, string | null>
  >(
    Object.fromEntries(
      result.identities.map((identity) => [identity.id, identity.mappedUserId]),
    ),
  );
  const canCommit = [
    "preview_ready",
    "failed",
    "completed_with_errors",
  ].includes(result.state);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const next = await apiRequest<ImportResult>(
        `/api/v1/workspaces/${workspaceId}/imports/${result.id}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            duplicateStrategy: "skip_existing",
            identityMappings,
          }),
        },
      );
      onResult(next);
      setMessage(
        next.state === "completed"
          ? "Import completed."
          : "The bounded import finished with explicit blocked or failed rows; inspect and retry after correcting the source.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not confirm import.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="adoption-import-result"
      aria-label="Import preview and result"
    >
      <div className="adoption-result-summary">
        <div>
          <span>State</span>
          <strong>{humanize(result.state)}</strong>
        </div>
        <div>
          <span>Rows</span>
          <strong>{result.totalRows}</strong>
        </div>
        <div>
          <span>Warnings</span>
          <strong>{result.warningRows}</strong>
        </div>
        <div>
          <span>Blocked</span>
          <strong>{result.blockedRows}</strong>
        </div>
        <div>
          <span>Created</span>
          <strong>{result.createdWorkItems}</strong>
        </div>
        <div>
          <span>Skipped</span>
          <strong>{result.skippedRows}</strong>
        </div>
        <div>
          <span>Failed</span>
          <strong>{result.failedRows}</strong>
        </div>
      </div>
      {result.unsupportedColumns.length ? (
        <div className="adoption-callout">
          <strong>Unsupported/custom columns reported</strong>
          <p>{result.unsupportedColumns.join(", ")}</p>
          <small>
            Bounded non-empty values remain migration metadata; they do not
            create custom workflows or fields.
          </small>
        </div>
      ) : (
        <p className="adoption-muted">
          No populated unsupported columns were detected.
        </p>
      )}
      {result.identities.length ? (
        <div className="adoption-identities">
          <h3>Source identities</h3>
          <p>Leaving an identity unresolved never creates workspace access.</p>
          {result.identities.map((identity) => (
            <label key={identity.id}>
              <span>
                {identity.displayName || identity.email || identity.identityKey}
              </span>
              <select
                value={identityMappings[identity.id] ?? ""}
                onChange={(event) =>
                  setIdentityMappings((current) => ({
                    ...current,
                    [identity.id]: event.target.value || null,
                  }))
                }
              >
                <option value="">Keep unresolved</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    Map to {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : (
        <p className="adoption-muted">
          No assignee or reporter identities were present.
        </p>
      )}
      <div
        className="adoption-row-table"
        role="table"
        aria-label="Import row outcomes"
      >
        <div className="adoption-row adoption-row-head" role="row">
          <span>Row</span>
          <span>Source</span>
          <span>Mapped work</span>
          <span>Outcome</span>
          <span>Evidence</span>
        </div>
        {result.rows.map((row) => {
          const normalized = row.normalizedData as { title?: string };
          return (
            <div className="adoption-row" role="row" key={row.id}>
              <span data-label="Row">{row.rowNumber}</span>
              <span data-label="Source">
                {row.sourceProjectKey} / {row.sourceObjectKey}
              </span>
              <span data-label="Mapped work">
                {normalized.title || "Untitled"}
              </span>
              <span
                data-label="Outcome"
                className={`state-token state-${row.outcome}`}
              >
                {humanize(row.outcome)}
              </span>
              <details data-label="Evidence">
                <summary>{row.messages.length} notes</summary>
                {row.messages.length ? (
                  <ul>
                    {row.messages.map((note, index) => (
                      <li key={`${note.code}-${index}`}>
                        <code>{note.code}</code> {note.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Valid with no warnings.</p>
                )}
              </details>
            </div>
          );
        })}
      </div>
      {result.rowPageInfo.hasNextPage && workspaceSlug ? (
        <Link
          className="button-secondary"
          href={`/app/${workspaceSlug}/settings/adoption/imports/${result.id}?page=${result.rowPageInfo.page + 1}`}
        >
          Next 100 rows
        </Link>
      ) : null}
      {canCommit ? (
        <button type="button" disabled={pending} onClick={confirm}>
          {pending
            ? "Committing bounded batches…"
            : result.committedAnything
              ? "Resume failed rows and skip existing source objects"
              : "Confirm import and skip existing source objects"}
        </button>
      ) : null}
      <output className="platform-status" aria-live="polite">
        {message}
      </output>
    </section>
  );
}

function ExportLedger({
  workspaceId,
  projects,
}: Readonly<{ workspaceId: string; projects: Project[] }>) {
  const [projectId, setProjectId] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const href = `/api/v1/workspaces/${workspaceId}/exports/delivery-core${
    projectId
      ? `?projectId=${encodeURIComponent(projectId)}&page=${projectPage}`
      : ""
  }`;
  return (
    <section className="adoption-section" id="export">
      <header>
        <p className="app-eyebrow">No lock-in</p>
        <h2>Core delivery CSV export</h2>
        <p>
          Exports clients, projects, milestones, cycles, work/subtasks,
          acceptance criteria, assignments, estimates, dates, labels, and
          migration references.
        </p>
      </header>
      <div className="adoption-export">
        <label>
          <span>Export scope</span>
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setProjectPage(1);
            }}
          >
            <option value="">First 25 non-archived projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} · {project.name}
              </option>
            ))}
          </select>
        </label>
        {projectId ? (
          <label>
            <span>Project export part</span>
            <input
              min={1}
              step={1}
              type="number"
              value={projectPage}
              onChange={(event) =>
                setProjectPage(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>
        ) : null}
        <a className="app-primary-button" href={href}>
          Download CSV
        </a>
      </div>
      <div className="adoption-callout">
        <strong>Defined portability boundary</strong>
        <p>
          This is a bounded core-delivery export, not a complete legal,
          commercial, engineering, QA, retention, or audit archive. Larger
          workspaces export one project or one 25-project page at a time. A
          project above the per-file limit downloads as deterministic parts;
          each filename states the current and total part count.
        </p>
      </div>
    </section>
  );
}

function templatePayload(data: FormData) {
  const original = parseOriginalDefinition(data);
  const originalMilestones = new Map(
    original?.milestones.map((item) => [item.ref, item]) ?? [],
  );
  const originalCycles = new Map(
    original?.cycles.map((item) => [item.ref, item]) ?? [],
  );
  const originalWorkItems = new Map(
    original?.workItems.map((item) => [item.ref, item]) ?? [],
  );
  return {
    name: formText(data, "name"),
    description: nullable(formText(data, "description")),
    definition: {
      projectSummary: nullable(formText(data, "projectSummary")),
      milestones: parseLines(formText(data, "milestones")).map((parts) => ({
        description: null,
        ...originalMilestones.get(parts[0]),
        ref: parts[0],
        name: parts[1],
        targetOffsetDays: parts[2] ? Number(parts[2]) : null,
      })),
      cycles: parseLines(formText(data, "cycles")).map((parts) => ({
        goal: null,
        ...originalCycles.get(parts[0]),
        ref: parts[0],
        name: parts[1],
        startOffsetDays: Number(parts[2] || 0),
        durationDays: Number(parts[3] || 14),
      })),
      workItems: parseLines(formText(data, "workItems")).map((parts) => ({
        description: null,
        status: "backlog" as const,
        priority: "none" as const,
        purpose: "client_delivery" as const,
        estimatePoints: null,
        targetOffsetDays: null,
        ...originalWorkItems.get(parts[0]),
        ref: parts[0],
        parentRef: nullable(parts[1] || ""),
        title: parts[2],
        acceptanceCriteria: nullable(parts[3] || ""),
        milestoneRef: nullable(parts[4] || ""),
        cycleRef: nullable(parts[5] || ""),
        labels: (parts[6] || "")
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
      })),
    },
  };
}

function parseOriginalDefinition(data: FormData) {
  const value = formText(data, "originalDefinition");
  if (!value) return null;
  try {
    return JSON.parse(value) as ProjectTemplateDefinition;
  } catch {
    return null;
  }
}

function parseLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((part) => part.trim()));
}

function serializeMilestones(items: ProjectTemplateDefinition["milestones"]) {
  return items
    .map((item) =>
      [item.ref, item.name, item.targetOffsetDays ?? ""].join(" | "),
    )
    .join("\n");
}

function serializeCycles(items: ProjectTemplateDefinition["cycles"]) {
  return items
    .map((item) =>
      [item.ref, item.name, item.startOffsetDays, item.durationDays].join(
        " | ",
      ),
    )
    .join("\n");
}

function serializeWorkItems(items: ProjectTemplateDefinition["workItems"]) {
  return items
    .map((item) =>
      [
        item.ref,
        item.parentRef ?? "",
        item.title,
        item.acceptanceCriteria ?? "",
        item.milestoneRef ?? "",
        item.cycleRef ?? "",
        item.labels.join(","),
      ].join(" | "),
    )
    .join("\n");
}

function parsePairs(value: string) {
  return Object.fromEntries(
    value
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        return separator > 0
          ? [
              entry.slice(0, separator).trim(),
              entry.slice(separator + 1).trim(),
            ]
          : [entry, ""];
      })
      .filter(([, mapped]) => mapped),
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function EmptyState({
  title,
  body,
}: Readonly<{ title: string; body: string }>) {
  return (
    <div className="delivery-empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
