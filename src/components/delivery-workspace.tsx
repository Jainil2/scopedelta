"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

type Client = {
  id: string;
  name: string;
  internalReference: string | null;
  summary: string | null;
  lifecycle: "active" | "archived";
};

type Member = {
  userId: string;
  name: string;
  email: string;
  workspaceRole?: string;
};

type Project = {
  id: string;
  key: string;
  name: string;
  summary: string | null;
  lifecycle: "active" | "completed" | "archived";
  clientName: string;
  leadUserId: string;
  leadName: string;
  targetDate: string | null;
  startDate?: string | null;
};

type Milestone = {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  status: "planned" | "in_progress" | "completed" | "archived";
};

type Label = { id: string; name: string; color: string };

type Dependency = {
  id: string;
  blockerWorkItemId: string;
  blockerIdentifier: string;
  blockerTitle: string;
  blockedWorkItemId: string;
  blockedIdentifier: string;
  blockedTitle: string;
};

type WorkItem = {
  id: string;
  identifier: string;
  parentId: string | null;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  status:
    "backlog" | "ready" | "in_progress" | "in_review" | "done" | "canceled";
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeUserId: string | null;
  assigneeName: string | null;
  estimatePoints: number | null;
  targetDate: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  labels: Label[];
};

type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
};

type BacklogFilters = {
  page: number;
  pageSize: number;
  status?: WorkItem["status"];
  priority?: WorkItem["priority"];
  assigneeUserId?: string;
  milestoneId?: string;
  labelId?: string;
};

const workflow = [
  ["backlog", "Backlog"],
  ["ready", "Ready"],
  ["in_progress", "In progress"],
  ["in_review", "In review"],
  ["done", "Done"],
  ["canceled", "Canceled"],
] as const;

export function ClientDirectory({
  workspaceId,
  workspaceSlug,
  role,
  clients,
  pageInfo,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  role: "owner" | "admin" | "member";
  clients: Client[];
  pageInfo: PageInfo;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const composerRef = useRef<HTMLDetailsElement>(null);

  async function create(formData: FormData) {
    setMessage("");
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/clients`,
      "POST",
      {
        name: String(formData.get("name") ?? ""),
        internalReference: String(formData.get("internalReference") ?? ""),
        summary: String(formData.get("summary") ?? ""),
      },
    );
    setMessage(response.ok ? "Client created." : response.message);
    if (response.ok) {
      composerRef.current?.querySelector("form")?.reset();
      composerRef.current?.removeAttribute("open");
      startTransition(() => router.refresh());
    }
  }

  async function setLifecycle(client: Client) {
    const next = client.lifecycle === "active" ? "archived" : "active";
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/clients/${client.id}`,
      "PATCH",
      { lifecycle: next },
    );
    setMessage(response.ok ? `Client ${next}.` : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  async function edit(client: Client, formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/clients/${client.id}`,
      "PATCH",
      {
        name: formData.get("name"),
        internalReference: formData.get("internalReference"),
        summary: formData.get("summary"),
      },
    );
    setMessage(response.ok ? "Client updated." : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  return (
    <div className="delivery-stack">
      <header className="delivery-page-header">
        <div>
          <p className="eyebrow">Workspace clients</p>
          <h1>Clients</h1>
          <p>Keep the delivery account boundary small and operational.</p>
        </div>
        <details className="delivery-composer" ref={composerRef}>
          <summary>New client</summary>
          <form action={create} className="delivery-form">
            <label>
              Client name
              <input name="name" minLength={2} maxLength={120} required />
            </label>
            <label>
              Internal reference
              <input name="internalReference" maxLength={80} />
            </label>
            <label>
              Summary
              <textarea name="summary" maxLength={2000} rows={3} />
            </label>
            <button disabled={pending}>Create client</button>
          </form>
        </details>
      </header>
      {message ? <p role="status">{message}</p> : null}
      <div className="delivery-list" aria-label="Clients">
        {clients.length ? (
          clients.map((client) => (
            <article className="delivery-list-row" key={client.id}>
              <div>
                <div className="delivery-row-title">
                  <strong>{client.name}</strong>
                  <span className={`state-token state-${client.lifecycle}`}>
                    {client.lifecycle}
                  </span>
                </div>
                <p>{client.summary || "No summary added."}</p>
              </div>
              <div className="delivery-row-meta">
                <span>{client.internalReference || "No reference"}</span>
                <details className="row-editor">
                  <summary>Edit</summary>
                  <form
                    action={edit.bind(null, client)}
                    className="delivery-form"
                  >
                    <label>
                      Name
                      <input name="name" defaultValue={client.name} required />
                    </label>
                    <label>
                      Internal reference
                      <input
                        name="internalReference"
                        defaultValue={client.internalReference || ""}
                      />
                    </label>
                    <label>
                      Summary
                      <textarea
                        name="summary"
                        rows={3}
                        defaultValue={client.summary || ""}
                      />
                    </label>
                    <button disabled={pending}>Save client</button>
                  </form>
                </details>
                {role !== "member" ? (
                  <button
                    className="button-secondary"
                    onClick={() => setLifecycle(client)}
                    disabled={pending}
                  >
                    {client.lifecycle === "active" ? "Archive" : "Restore"}
                  </button>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="delivery-empty">
            <h2>No clients yet</h2>
            <p>
              Create the client account that owns your first delivery project.
            </p>
          </div>
        )}
      </div>
      <nav className="pagination" aria-label="Client pages">
        {pageInfo.page > 1 ? (
          <Link
            href={`/app/${workspaceSlug}/clients?page=${pageInfo.page - 1}`}
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span>
          Page {pageInfo.page} · {pageInfo.total} clients
        </span>
        {pageInfo.hasNextPage ? (
          <Link
            href={`/app/${workspaceSlug}/clients?page=${pageInfo.page + 1}`}
          >
            Next
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}

export function ProjectDirectory({
  workspaceId,
  workspaceSlug,
  clients,
  clientPageInfo,
  members,
  projects,
  projectPageInfo,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  clients: Client[];
  clientPageInfo: PageInfo;
  members: Member[];
  projects: Project[];
  projectPageInfo: PageInfo;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const composerRef = useRef<HTMLDetailsElement>(null);
  const activeClients = clients.filter(
    (client) => client.lifecycle === "active",
  );

  async function create(formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects`,
      "POST",
      {
        clientId: formData.get("clientId"),
        key: String(formData.get("key") ?? "").toUpperCase(),
        name: formData.get("name"),
        summary: formData.get("summary"),
        leadUserId: formData.get("leadUserId"),
        startDate: nullable(formData.get("startDate")),
        targetDate: nullable(formData.get("targetDate")),
      },
    );
    setMessage(response.ok ? "Project created." : response.message);
    if (response.ok) {
      composerRef.current?.querySelector("form")?.reset();
      composerRef.current?.removeAttribute("open");
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="delivery-stack">
      <header className="delivery-page-header">
        <div>
          <p className="eyebrow">Delivery portfolio</p>
          <h1>Projects</h1>
          <p>
            Each project belongs to one client and starts with one clear lead.
          </p>
        </div>
        <details className="delivery-composer" ref={composerRef}>
          <summary>New project</summary>
          {activeClients.length ? (
            <form action={create} className="delivery-form delivery-form-grid">
              <label>
                Client
                <select name="clientId" required>
                  {activeClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Project key
                <input
                  name="key"
                  pattern="[A-Za-z][A-Za-z0-9]{1,9}"
                  placeholder="NORTH"
                  required
                />
              </label>
              <label className="form-span">
                Project name
                <input name="name" minLength={2} maxLength={160} required />
              </label>
              <label>
                Lead
                <select name="leadUserId" required>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Target date
                <input name="targetDate" type="date" />
              </label>
              <label className="form-span">
                Summary
                <textarea name="summary" maxLength={5000} rows={3} />
              </label>
              <button disabled={pending}>Create project</button>
            </form>
          ) : (
            <p>No active clients on this client page.</p>
          )}
          <nav
            className="pagination compact-pagination"
            aria-label="Client option pages"
          >
            {clientPageInfo.page > 1 ? (
              <Link
                href={projectDirectoryHref(
                  workspaceSlug,
                  projectPageInfo.page,
                  clientPageInfo.page - 1,
                )}
              >
                Previous clients
              </Link>
            ) : (
              <span />
            )}
            <span>Client choices · page {clientPageInfo.page}</span>
            {clientPageInfo.hasNextPage ? (
              <Link
                href={projectDirectoryHref(
                  workspaceSlug,
                  projectPageInfo.page,
                  clientPageInfo.page + 1,
                )}
              >
                Next clients
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </details>
      </header>
      {message ? <p role="status">{message}</p> : null}
      <div className="delivery-list" aria-label="Projects">
        {projects.length ? (
          projects.map((project) => (
            <Link
              className="delivery-list-row delivery-project-link"
              href={`/app/${workspaceSlug}/projects/${project.key}`}
              key={project.id}
            >
              <div>
                <div className="delivery-row-title">
                  <span className="project-key">{project.key}</span>
                  <strong>{project.name}</strong>
                  <span className={`state-token state-${project.lifecycle}`}>
                    {project.lifecycle}
                  </span>
                </div>
                <p>{project.summary || "No project summary added."}</p>
              </div>
              <div className="delivery-row-meta">
                <span>{project.clientName}</span>
                <span>Lead: {project.leadName}</span>
                <span>{project.targetDate || "No target date"}</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="delivery-empty">
            <h2>No accessible projects</h2>
            <p>Create a project or ask a project lead to add you.</p>
          </div>
        )}
      </div>
      <nav className="pagination" aria-label="Project pages">
        {projectPageInfo.page > 1 ? (
          <Link
            href={projectDirectoryHref(
              workspaceSlug,
              projectPageInfo.page - 1,
              clientPageInfo.page,
            )}
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span>
          Page {projectPageInfo.page} · {projectPageInfo.total} projects
        </span>
        {projectPageInfo.hasNextPage ? (
          <Link
            href={projectDirectoryHref(
              workspaceSlug,
              projectPageInfo.page + 1,
              clientPageInfo.page,
            )}
          >
            Next
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}

export function ProjectOverview({
  workspaceId,
  workspaceSlug,
  project,
  milestones,
  projectMembers,
  workspaceMembers,
  canManage,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: Project & {
    id: string;
    clientName: string;
    counts: Array<{ status: string; total: number }>;
  };
  milestones: Milestone[];
  projectMembers: Member[];
  workspaceMembers: Member[];
  canManage: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const milestoneComposerRef = useRef<HTMLDetailsElement>(null);
  const available = workspaceMembers.filter(
    (candidate) =>
      !projectMembers.some((member) => member.userId === candidate.userId),
  );

  async function createMilestone(formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/milestones`,
      "POST",
      {
        name: formData.get("name"),
        targetDate: nullable(formData.get("targetDate")),
        description: formData.get("description"),
      },
    );
    setMessage(response.ok ? "Milestone created." : response.message);
    if (response.ok) {
      milestoneComposerRef.current?.querySelector("form")?.reset();
      milestoneComposerRef.current?.removeAttribute("open");
      startTransition(() => router.refresh());
    }
  }

  async function addMember(formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/members`,
      "POST",
      { userId: formData.get("userId") },
    );
    setMessage(response.ok ? "Project member added." : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  async function updateLifecycle(lifecycle: Project["lifecycle"]) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}`,
      "PATCH",
      { lifecycle },
    );
    setMessage(response.ok ? `Project ${lifecycle}.` : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  async function editProject(formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}`,
      "PATCH",
      {
        name: formData.get("name"),
        summary: formData.get("summary"),
        leadUserId: formData.get("leadUserId"),
        startDate: nullable(formData.get("startDate")),
        targetDate: nullable(formData.get("targetDate")),
      },
    );
    setMessage(response.ok ? "Project updated." : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  async function updateMilestoneStatus(
    milestone: Milestone,
    status: Milestone["status"],
  ) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/milestones/${milestone.id}`,
      "PATCH",
      { status },
    );
    setMessage(response.ok ? "Milestone updated." : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  async function editMilestone(milestone: Milestone, formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/milestones/${milestone.id}`,
      "PATCH",
      {
        name: formData.get("name"),
        description: formData.get("description"),
        targetDate: nullable(formData.get("targetDate")),
      },
    );
    setMessage(response.ok ? "Milestone details updated." : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  async function removeMember(member: Member) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/members/${member.userId}`,
      "DELETE",
      {},
    );
    setMessage(response.ok ? "Project member removed." : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  return (
    <div className="delivery-stack">
      <header className="project-header">
        <div>
          <p className="eyebrow">{project.clientName}</p>
          <div className="delivery-row-title">
            <span className="project-key">{project.key}</span>
            <h1>{project.name}</h1>
          </div>
          <p>{project.summary || "No project summary added."}</p>
        </div>
        <nav className="project-tabs" aria-label="Project">
          <Link
            aria-current="page"
            href={`/app/${workspaceSlug}/projects/${project.key}`}
          >
            Overview
          </Link>
          <Link href={`/app/${workspaceSlug}/projects/${project.key}/backlog`}>
            Backlog
          </Link>
        </nav>
      </header>
      {canManage ? (
        <details className="project-editor">
          <summary>Edit project details</summary>
          <form
            action={editProject}
            className="delivery-form delivery-form-grid"
          >
            <label className="form-span">
              Project name
              <input name="name" defaultValue={project.name} required />
            </label>
            <label>
              Lead
              <select name="leadUserId" defaultValue={project.leadUserId}>
                {projectMembers.map((member) => (
                  <option value={member.userId} key={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input
                name="startDate"
                type="date"
                defaultValue={project.startDate || ""}
              />
            </label>
            <label>
              Target date
              <input
                name="targetDate"
                type="date"
                defaultValue={project.targetDate || ""}
              />
            </label>
            <label className="form-span">
              Summary
              <textarea
                name="summary"
                rows={4}
                defaultValue={project.summary || ""}
              />
            </label>
            <button disabled={pending}>Save project</button>
          </form>
        </details>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <section className="project-summary-strip" aria-label="Project status">
        {workflow.map(([id, label]) => (
          <div key={id}>
            <strong>
              {project.counts.find((count) => count.status === id)?.total ?? 0}
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      <div className="project-columns">
        <section>
          <div className="section-heading">
            <div>
              <h2>Milestones</h2>
              <p>Client delivery checkpoints, independent of cycles.</p>
            </div>
            {project.lifecycle === "active" ? (
              <details
                className="delivery-composer compact"
                ref={milestoneComposerRef}
              >
                <summary>New milestone</summary>
                <form action={createMilestone} className="delivery-form">
                  <label>
                    Name
                    <input name="name" required />
                  </label>
                  <label>
                    Target date
                    <input name="targetDate" type="date" />
                  </label>
                  <label>
                    Description
                    <textarea name="description" rows={3} />
                  </label>
                  <button disabled={pending}>Create milestone</button>
                </form>
              </details>
            ) : null}
          </div>
          <div className="delivery-list compact-list">
            {milestones.map((milestone) => (
              <div className="delivery-list-row" key={milestone.id}>
                <div>
                  <strong>{milestone.name}</strong>
                  <p>{milestone.description || "No description."}</p>
                </div>
                <div className="delivery-row-meta">
                  <select
                    aria-label={`Status for ${milestone.name}`}
                    value={milestone.status}
                    onChange={(event) =>
                      updateMilestoneStatus(
                        milestone,
                        event.target.value as Milestone["status"],
                      )
                    }
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                  <span>{milestone.targetDate || "No target date"}</span>
                  <details className="row-editor">
                    <summary>Edit</summary>
                    <form
                      action={editMilestone.bind(null, milestone)}
                      className="delivery-form"
                    >
                      <label>
                        Name
                        <input
                          name="name"
                          defaultValue={milestone.name}
                          required
                        />
                      </label>
                      <label>
                        Target date
                        <input
                          name="targetDate"
                          type="date"
                          defaultValue={milestone.targetDate || ""}
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          name="description"
                          rows={3}
                          defaultValue={milestone.description || ""}
                        />
                      </label>
                      <button disabled={pending}>Save milestone</button>
                    </form>
                  </details>
                </div>
              </div>
            ))}
            {!milestones.length ? <p>No milestones yet.</p> : null}
          </div>
        </section>
        <aside>
          <div className="section-heading">
            <div>
              <h2>Project access</h2>
              <p>{projectMembers.length} explicit members</p>
            </div>
          </div>
          <ul className="member-list">
            {projectMembers.map((member) => (
              <li key={member.userId}>
                <span>
                  {member.name}
                  <small>{member.workspaceRole}</small>
                </span>
                {canManage && member.userId !== project.leadUserId ? (
                  <button
                    className="danger-link"
                    onClick={() => removeMember(member)}
                    disabled={pending}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {canManage && available.length ? (
            <form action={addMember} className="inline-form">
              <label>
                Add member
                <select name="userId">
                  {available.map((member) => (
                    <option value={member.userId} key={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={pending}>Add</button>
            </form>
          ) : null}
          {canManage ? (
            <div className="lifecycle-actions">
              <span>Lifecycle</span>
              {project.lifecycle !== "active" ? (
                <button onClick={() => updateLifecycle("active")}>
                  Restore
                </button>
              ) : (
                <>
                  <button onClick={() => updateLifecycle("completed")}>
                    Complete
                  </button>
                  <button onClick={() => updateLifecycle("archived")}>
                    Archive
                  </button>
                </>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export function BacklogWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  items,
  pageInfo,
  members,
  milestones,
  labels,
  dependencies,
  filters,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: Project;
  items: WorkItem[];
  pageInfo: PageInfo;
  members: Member[];
  milestones: Milestone[];
  labels: Label[];
  dependencies: Dependency[];
  filters: BacklogFilters;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const workComposerRef = useRef<HTMLDetailsElement>(null);
  const filtered = Boolean(
    filters.status ||
    filters.priority ||
    filters.assigneeUserId ||
    filters.milestoneId ||
    filters.labelId,
  );
  const grouped = useMemo(
    () =>
      workflow.map(([id, label]) => ({
        id,
        label,
        items: items.filter((item) => item.status === id),
      })),
    [items],
  );

  function refresh(messageText: string) {
    setMessage(messageText);
    startTransition(() => router.refresh());
  }

  async function create(formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items`,
      "POST",
      workItemPayload(formData),
    );
    if (response.ok) {
      workComposerRef.current?.querySelector("form")?.reset();
      workComposerRef.current?.removeAttribute("open");
      refresh("Work item created.");
    } else setMessage(response.message);
  }

  async function save(formData: FormData) {
    if (!selected) return;
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items/${selected.id}`,
      "PATCH",
      workItemPayload(formData),
    );
    if (response.ok) {
      setSelected(null);
      refresh("Work item updated.");
    } else setMessage(response.message);
  }

  async function reorder(item: WorkItem, direction: "up" | "down") {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items/${item.id}/reorder`,
      "POST",
      { direction },
    );
    if (response.ok) refresh("Backlog order updated.");
    else setMessage(response.message);
  }

  async function archive(item: WorkItem) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items/${item.id}`,
      "PATCH",
      { archived: true },
    );
    if (response.ok) {
      setSelected(null);
      refresh("Work item archived.");
    } else setMessage(response.message);
  }

  async function createLabel(formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/labels`,
      "POST",
      { name: formData.get("name"), color: formData.get("color") },
    );
    if (response.ok) refresh("Label created.");
    else setMessage(response.message);
  }

  async function addBlock(formData: FormData) {
    if (!selected) return;
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items/${selected.id}/dependencies`,
      "POST",
      { blockedWorkItemId: formData.get("blockedWorkItemId") },
    );
    if (response.ok) refresh("Dependency added.");
    else setMessage(response.message);
  }

  async function removeBlock(dependency: Dependency) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/dependencies/${dependency.id}`,
      "DELETE",
      {},
    );
    if (response.ok) refresh("Dependency removed.");
    else setMessage(response.message);
  }

  return (
    <div className="delivery-stack backlog-workspace">
      <header className="project-header">
        <div>
          <p className="eyebrow">{project.clientName}</p>
          <div className="delivery-row-title">
            <span className="project-key">{project.key}</span>
            <h1>Backlog</h1>
          </div>
          <p>
            {pageInfo.total} active work items · {project.name}
          </p>
        </div>
        <nav className="project-tabs" aria-label="Project">
          <Link href={`/app/${workspaceSlug}/projects/${project.key}`}>
            Overview
          </Link>
          <Link
            aria-current="page"
            href={`/app/${workspaceSlug}/projects/${project.key}/backlog`}
          >
            Backlog
          </Link>
        </nav>
      </header>
      {message ? <p role="status">{message}</p> : null}
      <div className="backlog-toolbar">
        <form className="backlog-filters">
          {filters.pageSize !== 50 ? (
            <input type="hidden" name="pageSize" value={filters.pageSize} />
          ) : null}
          <select
            name="status"
            aria-label="Filter by status"
            defaultValue={filters.status || ""}
          >
            <option value="">All statuses</option>
            {workflow.map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="assigneeUserId"
            aria-label="Filter by assignee"
            defaultValue={filters.assigneeUserId || ""}
          >
            <option value="">All assignees</option>
            {members.map((member) => (
              <option value={member.userId} key={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
          <select
            name="priority"
            aria-label="Filter by priority"
            defaultValue={filters.priority || ""}
          >
            <option value="">All priorities</option>
            {["urgent", "high", "medium", "low", "none"].map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
          <select
            name="milestoneId"
            aria-label="Filter by milestone"
            defaultValue={filters.milestoneId || ""}
          >
            <option value="">All milestones</option>
            {milestones.map((milestone) => (
              <option value={milestone.id} key={milestone.id}>
                {milestone.name}
              </option>
            ))}
          </select>
          <select
            name="labelId"
            aria-label="Filter by label"
            defaultValue={filters.labelId || ""}
          >
            <option value="">All labels</option>
            {labels.map((label) => (
              <option value={label.id} key={label.id}>
                {label.name}
              </option>
            ))}
          </select>
          <button className="button-secondary">Apply filters</button>
          {filtered ? (
            <Link
              href={`/app/${workspaceSlug}/projects/${project.key}/backlog`}
            >
              Clear
            </Link>
          ) : null}
        </form>
        <details className="delivery-composer" ref={workComposerRef}>
          <summary>New work item</summary>
          <WorkItemForm
            action={create}
            pending={pending}
            members={members}
            milestones={milestones}
            labels={labels}
            parents={items.filter((item) => !item.parentId)}
          />
        </details>
      </div>
      <div className="backlog-groups">
        {grouped.map((group) => (
          <section className="backlog-group" key={group.id}>
            <header>
              <h2>{group.label}</h2>
              <span>{group.items.length}</span>
            </header>
            <div className="backlog-rows">
              {group.items.map((item) => (
                <article className="backlog-row" key={item.id}>
                  <button
                    className="work-summary"
                    onClick={() => setSelected(item)}
                  >
                    <span className="work-identifier">{item.identifier}</span>
                    <strong>{item.title}</strong>
                    {item.parentId ? <small>Subtask</small> : null}
                  </button>
                  <div className="work-metadata">
                    <span className={`priority priority-${item.priority}`}>
                      {item.priority}
                    </span>
                    <span>{item.assigneeName || "Unassigned"}</span>
                    <span>{item.milestoneName || "No milestone"}</span>
                    {item.labels.map((label) => (
                      <span
                        className={`label-token label-${label.color}`}
                        key={label.id}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                  {!filtered ? (
                    <div
                      className="reorder-actions"
                      aria-label={`Reorder ${item.identifier}`}
                    >
                      <button
                        title="Move up"
                        onClick={() => reorder(item, "up")}
                      >
                        ↑
                      </button>
                      <button
                        title="Move down"
                        onClick={() => reorder(item, "down")}
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {!group.items.length ? (
                <p className="empty-status">No work in this state.</p>
              ) : null}
            </div>
          </section>
        ))}
      </div>
      <nav className="pagination" aria-label="Backlog pages">
        {pageInfo.page > 1 ? (
          <Link href={backlogPageHref(filters, pageInfo.page - 1)}>
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span>Page {pageInfo.page}</span>
        {pageInfo.hasNextPage ? (
          <Link href={backlogPageHref(filters, pageInfo.page + 1)}>Next</Link>
        ) : (
          <span />
        )}
      </nav>
      <details className="label-manager">
        <summary>Manage labels</summary>
        <form action={createLabel} className="inline-form">
          <label>
            Label name
            <input name="name" required maxLength={40} />
          </label>
          <label>
            Color
            <select name="color">
              {["slate", "blue", "green", "amber", "red", "violet"].map(
                (color) => (
                  <option key={color}>{color}</option>
                ),
              )}
            </select>
          </label>
          <button disabled={pending}>Create label</button>
        </form>
      </details>
      {selected ? (
        <div className="work-editor-backdrop" role="presentation">
          <section
            className="work-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-editor-title"
          >
            <header>
              <div>
                <span className="work-identifier">{selected.identifier}</span>
                <h2 id="work-editor-title">Edit work item</h2>
              </div>
              <button
                className="button-secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </header>
            <WorkItemForm
              action={save}
              pending={pending}
              item={selected}
              members={members}
              milestones={milestones}
              labels={labels}
              parents={items.filter(
                (item) => !item.parentId && item.id !== selected.id,
              )}
            />
            <section className="dependency-editor">
              <h3>Blocking dependencies</h3>
              <ul>
                {dependencies
                  .filter(
                    (dependency) =>
                      dependency.blockerWorkItemId === selected.id ||
                      dependency.blockedWorkItemId === selected.id,
                  )
                  .map((dependency) => (
                    <li key={dependency.id}>
                      <span>
                        {dependency.blockerWorkItemId === selected.id
                          ? `Blocks ${dependency.blockedIdentifier} · ${dependency.blockedTitle}`
                          : `Blocked by ${dependency.blockerIdentifier} · ${dependency.blockerTitle}`}
                      </span>
                      <button onClick={() => removeBlock(dependency)}>
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
              <form action={addBlock} className="inline-form">
                <label>
                  This item blocks
                  <select name="blockedWorkItemId" required>
                    {items
                      .filter((item) => item.id !== selected.id)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.identifier} · {item.title}
                        </option>
                      ))}
                  </select>
                </label>
                <button disabled={pending || items.length < 2}>
                  Add dependency
                </button>
              </form>
            </section>
            <button className="danger-link" onClick={() => archive(selected)}>
              Archive work item
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function WorkItemForm({
  action,
  pending,
  item,
  members,
  milestones,
  labels,
  parents,
}: Readonly<{
  action: (formData: FormData) => void | Promise<void>;
  pending: boolean;
  item?: WorkItem;
  members: Member[];
  milestones: Milestone[];
  labels: Label[];
  parents: WorkItem[];
}>) {
  return (
    <form
      action={action}
      className="delivery-form delivery-form-grid work-form"
    >
      <label className="form-span">
        Title
        <input
          name="title"
          required
          defaultValue={item?.title}
          maxLength={240}
        />
      </label>
      <label>
        Status
        <select name="status" defaultValue={item?.status || "backlog"}>
          {workflow.map(([id, label]) => (
            <option value={id} key={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Priority
        <select name="priority" defaultValue={item?.priority || "none"}>
          {["none", "low", "medium", "high", "urgent"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Assignee
        <select name="assigneeUserId" defaultValue={item?.assigneeUserId || ""}>
          <option value="">Unassigned</option>
          {item?.assigneeUserId &&
          !members.some((member) => member.userId === item.assigneeUserId) ? (
            <option value={item.assigneeUserId}>
              {item.assigneeName || "Historical assignee"} (no current access)
            </option>
          ) : null}
          {members.map((member) => (
            <option value={member.userId} key={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Milestone
        <select name="milestoneId" defaultValue={item?.milestoneId || ""}>
          <option value="">No milestone</option>
          {milestones
            .filter(
              (milestone) =>
                milestone.status !== "archived" ||
                milestone.id === item?.milestoneId,
            )
            .map((milestone) => (
              <option value={milestone.id} key={milestone.id}>
                {milestone.name}
                {milestone.status === "archived" ? " (archived)" : ""}
              </option>
            ))}
        </select>
      </label>
      <label>
        Estimate points
        <input
          name="estimatePoints"
          type="number"
          min={1}
          max={100}
          defaultValue={item?.estimatePoints || ""}
        />
      </label>
      <label>
        Target date
        <input
          name="targetDate"
          type="date"
          defaultValue={item?.targetDate || ""}
        />
      </label>
      {item || parents.length ? (
        <label className="form-span">
          Parent work item
          <select name="parentId" defaultValue={item?.parentId || ""}>
            <option value="">Top-level work</option>
            {item?.parentId &&
            !parents.some((parent) => parent.id === item.parentId) ? (
              <option value={item.parentId}>Current parent</option>
            ) : null}
            {parents.map((parent) => (
              <option value={parent.id} key={parent.id}>
                {parent.identifier} · {parent.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <fieldset className="form-span label-fieldset">
        <legend>Labels</legend>
        {labels.map((label) => (
          <label key={label.id}>
            <input
              type="checkbox"
              name="labelIds"
              value={label.id}
              defaultChecked={item?.labels.some(
                (current) => current.id === label.id,
              )}
            />
            {label.name}
          </label>
        ))}
        {!labels.length ? <span>No labels created.</span> : null}
      </fieldset>
      <label className="form-span">
        Description
        <textarea
          name="description"
          rows={5}
          maxLength={10000}
          defaultValue={item?.description || ""}
        />
      </label>
      <label className="form-span">
        Acceptance criteria
        <textarea
          name="acceptanceCriteria"
          rows={5}
          maxLength={10000}
          defaultValue={item?.acceptanceCriteria || ""}
        />
      </label>
      <button disabled={pending}>
        {item ? "Save changes" : "Create work item"}
      </button>
    </form>
  );
}

function backlogPageHref(filters: BacklogFilters, page: number) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.assigneeUserId)
    query.set("assigneeUserId", filters.assigneeUserId);
  if (filters.priority) query.set("priority", filters.priority);
  if (filters.milestoneId) query.set("milestoneId", filters.milestoneId);
  if (filters.labelId) query.set("labelId", filters.labelId);
  if (filters.pageSize !== 50) query.set("pageSize", String(filters.pageSize));
  query.set("page", String(page));
  return `?${query.toString()}`;
}

function projectDirectoryHref(
  workspaceSlug: string,
  projectPage: number,
  clientPage: number,
) {
  const query = new URLSearchParams({
    page: String(projectPage),
    clientPage: String(clientPage),
  });
  return `/app/${workspaceSlug}/projects?${query.toString()}`;
}

function workItemPayload(formData: FormData) {
  const estimate = String(formData.get("estimatePoints") ?? "");
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    acceptanceCriteria: formData.get("acceptanceCriteria"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    assigneeUserId: nullable(formData.get("assigneeUserId")),
    estimatePoints: estimate ? Number(estimate) : null,
    targetDate: nullable(formData.get("targetDate")),
    milestoneId: nullable(formData.get("milestoneId")),
    parentId: nullable(formData.get("parentId")),
    labelIds: formData.getAll("labelIds"),
  };
}

function nullable(value: FormDataEntryValue | null) {
  return value ? String(value) : null;
}

async function apiRequest(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
  };
  return {
    ok: response.ok,
    message: payload.error?.message || "The action could not be completed.",
  };
}
