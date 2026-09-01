"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { ActionableEmptyState } from "@/components/self-service-workspace";
import {
  AppButton,
  AppField,
  AppFormActions,
  AppInput,
  AppSelect,
  AppTextarea,
} from "@/components/app-form-controls";

type Client = {
  id: string;
  name: string;
  internalReference: string | null;
  summary: string | null;
  lifecycle: "active" | "archived";
};

export type Member = {
  userId: string;
  name: string;
  email: string;
  workspaceRole?: string;
};

export type Project = {
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

export type Milestone = {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  status: "planned" | "in_progress" | "completed" | "archived";
};

export type Label = { id: string; name: string; color: string };

export type Cycle = {
  id: string;
  sequence: number;
  name: string;
  startDate: string;
  endDate: string;
  lifecycle: "planned" | "active" | "completed" | "archived";
  goal: string | null;
};

type Dependency = {
  id: string;
  blockerWorkItemId: string;
  blockerIdentifier: string;
  blockerTitle: string;
  blockedWorkItemId: string;
  blockedIdentifier: string;
  blockedTitle: string;
};

export type WorkItem = {
  id: string;
  identifier: string;
  parentId: string | null;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  status:
    "backlog" | "ready" | "in_progress" | "in_review" | "done" | "canceled";
  priority: "none" | "low" | "medium" | "high" | "urgent";
  purpose: "unclassified" | "client_delivery" | "delivery_support" | "internal";
  commercialBasisCount: number;
  commercialHistoricalBasisCount?: number;
  commercialStaleBasisCount?: number;
  archivedAt?: string | Date | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  estimatePoints: number | null;
  targetDate: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  cycleId: string | null;
  cycleName: string | null;
  cycleLifecycle: Cycle["lifecycle"] | null;
  labels: Label[];
};

export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
};

export type WorkspaceMemberPageInfo = {
  number: number;
  size: number;
  total: number;
  pages: number;
};

export function WorkspaceMemberPicker({
  workspaceId,
  name,
  label,
  initialMembers,
  initialPageInfo,
  defaultValue,
  excludeUserIds = [],
}: Readonly<{
  workspaceId: string;
  name: string;
  label: string;
  initialMembers: Member[];
  initialPageInfo: WorkspaceMemberPageInfo;
  defaultValue?: string;
  excludeUserIds?: string[];
}>) {
  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const eligibleInitial = useMemo(
    () => initialMembers.filter((member) => !excluded.has(member.userId)),
    [excluded, initialMembers],
  );
  const [members, setMembers] = useState(eligibleInitial);
  const [pageInfo, setPageInfo] = useState(initialPageInfo);
  const [selectedUserId, setSelectedUserId] = useState(
    defaultValue ?? eligibleInitial[0]?.userId ?? "",
  );
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const eligibleMembers = members.filter(
    (member) => !excluded.has(member.userId),
  );
  const selectedMember = [...eligibleInitial, ...eligibleMembers].find(
    (member) => member.userId === selectedUserId,
  );
  const choices = selectedMember
    ? [
        selectedMember,
        ...eligibleMembers.filter(
          (member) => member.userId !== selectedMember.userId,
        ),
      ]
    : eligibleMembers;
  const effectiveSelectedUserId =
    selectedMember?.userId ?? choices[0]?.userId ?? "";

  async function load(page: number) {
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams({
        status: "active",
        page: String(page),
        pageSize: "25",
      });
      if (search.trim()) query.set("query", search.trim());
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/members?${query.toString()}`,
      );
      const payload = (await response.json()) as {
        data?: {
          members: Array<
            Member & { role?: string; status?: "active" | "suspended" }
          >;
          memberPage: WorkspaceMemberPageInfo;
        };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "Member choices could not be loaded.",
        );
      }
      const nextMembers = payload.data.members
        .filter((member) => !excluded.has(member.userId))
        .map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
          workspaceRole: member.workspaceRole ?? member.role,
        }));
      setMembers(nextMembers);
      setPageInfo(payload.data.memberPage);
      if (!selectedUserId && nextMembers[0]) {
        setSelectedUserId(nextMembers[0].userId);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Member choices could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workspace-member-picker">
      <label>
        <span>{label}</span>
        <select
          name={name}
          value={effectiveSelectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          required
        >
          {!choices.length ? (
            <option value="">No matching members</option>
          ) : null}
          {choices.map((member) => (
            <option value={member.userId} key={member.userId}>
              {member.name} · {member.email}
            </option>
          ))}
        </select>
      </label>
      <div className="workspace-member-picker-search">
        <label>
          <span>Search {label.toLowerCase()}</span>
          <input
            type="search"
            value={search}
            maxLength={120}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void load(1);
              }
            }}
          />
        </label>
        <button type="button" disabled={loading} onClick={() => void load(1)}>
          {loading ? "Loading…" : "Search"}
        </button>
      </div>
      <nav
        className="pagination compact-pagination"
        aria-label={`${label} pages`}
      >
        {pageInfo.number > 1 ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(pageInfo.number - 1)}
          >
            Previous
          </button>
        ) : (
          <span />
        )}
        <span>
          Page {pageInfo.number} of {Math.max(pageInfo.pages, 1)} ·{" "}
          {pageInfo.total} active members
        </span>
        {pageInfo.number < pageInfo.pages ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(pageInfo.number + 1)}
          >
            Next
          </button>
        ) : (
          <span />
        )}
      </nav>
      {message ? <output>{message}</output> : null}
    </div>
  );
}

export type BacklogFilters = {
  page: number;
  pageSize: number;
  query?: string;
  status?: WorkItem["status"];
  priority?: WorkItem["priority"];
  assigneeUserId?: string;
  milestoneId?: string;
  cycleId?: string;
  labelId?: string;
};

export const workflow = [
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
        name: formText(formData, "name"),
        internalReference: formText(formData, "internalReference"),
        summary: formText(formData, "summary"),
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
              <span>Client name</span>
              <input name="name" minLength={2} maxLength={120} required />
            </label>
            <label>
              <span>Internal reference</span>
              <input name="internalReference" maxLength={80} />
            </label>
            <label>
              <span>Summary</span>
              <textarea name="summary" maxLength={2000} rows={3} />
            </label>
            <button type="submit" disabled={pending}>
              Create client
            </button>
          </form>
        </details>
      </header>
      {message ? <output>{message}</output> : null}
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
                      <span>Name</span>
                      <input name="name" defaultValue={client.name} required />
                    </label>
                    <label>
                      <span>Internal reference</span>
                      <input
                        name="internalReference"
                        defaultValue={client.internalReference || ""}
                      />
                    </label>
                    <label>
                      <span>Summary</span>
                      <textarea
                        name="summary"
                        rows={3}
                        defaultValue={client.summary || ""}
                      />
                    </label>
                    <button type="submit" disabled={pending}>
                      Save client
                    </button>
                  </form>
                </details>
                {role !== "member" ? (
                  <button
                    type="button"
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
          <ActionableEmptyState
            title="No clients yet"
            why="Clients establish the tenant-safe account boundary for delivery projects."
            prerequisite="An owner or admin can create the first client from this page."
            next="Review the activation path"
            href={`/app/${workspaceSlug}/settings/getting-started`}
          />
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
  memberPageInfo,
  projects,
  projectPageInfo,
  query,
  lifecycle,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  clients: Client[];
  clientPageInfo: PageInfo;
  members: Member[];
  memberPageInfo: WorkspaceMemberPageInfo;
  projects: Project[];
  projectPageInfo: PageInfo;
  query?: string;
  lifecycle: "current" | "active" | "completed" | "archived" | "all";
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
        key: formText(formData, "key").toUpperCase(),
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
                <span>Client</span>
                <select name="clientId" required>
                  {activeClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Project key</span>
                <input
                  name="key"
                  pattern="[A-Za-z][A-Za-z0-9]{1,9}"
                  placeholder="NORTH"
                  required
                />
              </label>
              <label className="form-span">
                <span>Project name</span>
                <input name="name" minLength={2} maxLength={160} required />
              </label>
              <WorkspaceMemberPicker
                workspaceId={workspaceId}
                name="leadUserId"
                label="Lead"
                initialMembers={members}
                initialPageInfo={memberPageInfo}
              />
              <label>
                <span>Target date</span>
                <input name="targetDate" type="date" />
              </label>
              <label className="form-span">
                <span>Summary</span>
                <textarea name="summary" maxLength={5000} rows={3} />
              </label>
              <button type="submit" disabled={pending}>
                Create project
              </button>
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
                  query,
                  lifecycle,
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
                  query,
                  lifecycle,
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
      {message ? <output>{message}</output> : null}
      <form className="directory-search">
        <input type="hidden" name="clientPage" value={clientPageInfo.page} />
        <input
          type="search"
          name="query"
          aria-label="Search projects"
          placeholder="Search project key, name, or client"
          defaultValue={query || ""}
          maxLength={120}
        />
        <select
          name="lifecycle"
          aria-label="Project lifecycle"
          defaultValue={lifecycle}
        >
          <option value="current">Active and completed</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
          <option value="all">All lifecycle states</option>
        </select>
        <button type="submit" className="button-secondary">
          Search
        </button>
        {query ? (
          <Link href={`/app/${workspaceSlug}/projects`}>Clear</Link>
        ) : null}
      </form>
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
          <ActionableEmptyState
            title="No accessible projects"
            why="Projects hold delivery, commercial, collaboration, and evidence records."
            prerequisite={
              activeClients.length
                ? "Use a template when one exists, or create a project directly."
                : "Create an active client before creating a project."
            }
            next={
              activeClients.length ? "Review project setup" : "Create a client"
            }
            href={
              activeClients.length
                ? `/app/${workspaceSlug}/settings/getting-started`
                : `/app/${workspaceSlug}/clients`
            }
          />
        )}
      </div>
      <nav className="pagination" aria-label="Project pages">
        {projectPageInfo.page > 1 ? (
          <Link
            href={projectDirectoryHref(
              workspaceSlug,
              projectPageInfo.page - 1,
              clientPageInfo.page,
              query,
              lifecycle,
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
              query,
              lifecycle,
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
  cycles,
  attention,
  commercial,
  projectMembers,
  workspaceMembers,
  workspaceMemberPageInfo,
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
  cycles: Cycle[];
  attention: {
    items: Array<
      Pick<
        WorkItem,
        "id" | "identifier" | "title" | "status" | "priority" | "targetDate"
      >
    >;
    pageInfo: PageInfo;
  };
  commercial: {
    counts: Record<
      | "commercially_unlinked"
      | "needs_classification"
      | "linked"
      | "stale_basis"
      | "support_internal",
      number
    >;
    affectedTotal: number;
    baseline: {
      versionId: string;
      versionNumber: number | null;
      label: string;
      state: string;
      effectiveAt: string | Date | null;
    } | null;
  } | null;
  projectMembers: Member[];
  workspaceMembers: Member[];
  workspaceMemberPageInfo: WorkspaceMemberPageInfo;
  canManage: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const milestoneComposerRef = useRef<HTMLDetailsElement>(null);
  const currentCycle =
    cycles.find((cycle) => cycle.lifecycle === "active") ??
    cycles.find((cycle) => cycle.lifecycle === "planned") ??
    null;
  const upcomingMilestone =
    milestones.find((milestone) => milestone.status === "in_progress") ??
    [...milestones]
      .filter((milestone) => milestone.status === "planned")
      .sort((left, right) =>
        (left.targetDate ?? "9999-12-31").localeCompare(
          right.targetDate ?? "9999-12-31",
        ),
      )[0] ??
    null;

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
          <p className="eyebrow">{project.clientName} · Project briefing</p>
          <div className="delivery-row-title command-center-title">
            <h1>{project.name}</h1>
            <span className={`state-token state-${project.lifecycle}`}>
              {project.lifecycle}
            </span>
          </div>
          <p>{project.summary || "No project summary added."}</p>
          <p className="command-center-context">
            <span className="project-key">{project.key}</span>
            <span>Current delivery and commercial position</span>
          </p>
        </div>
        <div className="command-center-actions">
          <Link href={`/app/${workspaceSlug}/my-work`}>My work</Link>
          <Link href={`/app/${workspaceSlug}/projects/${project.key}/backlog`}>
            Open backlog
          </Link>
          <Link href={`/app/${workspaceSlug}/projects/${project.key}/client`}>
            Client collaboration
          </Link>
        </div>
      </header>
      <section className="project-summary-strip" aria-label="Delivery status">
        {workflow.map(([id, label]) => (
          <div key={id}>
            <strong>
              {project.counts.find((count) => count.status === id)?.total ?? 0}
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      {commercial ? (
        <section
          className="command-commercial"
          aria-labelledby="commercial-signal-title"
        >
          <div className="command-commercial-heading">
            <div>
              <p className="eyebrow">Commercial delivery graph</p>
              <h2 id="commercial-signal-title">Delivery drift</h2>
              <p>
                {commercial.baseline
                  ? `${commercial.baseline.label} · ${commercial.baseline.state === "draft" || commercial.baseline.versionNumber === null ? "draft" : `version ${commercial.baseline.versionNumber}`}`
                  : "No commercial baseline is active yet."}
              </p>
            </div>
            <Link
              href={`/app/${workspaceSlug}/projects/${project.key}/commercial`}
            >
              Inspect commercial evidence →
            </Link>
          </div>
          <dl className="command-commercial-counts">
            {[
              ["commercially_unlinked", "Unlinked"],
              ["stale_basis", "Stale basis"],
              ["needs_classification", "Classify"],
              ["linked", "Linked"],
              ["support_internal", "Support / internal"],
            ].map(([state, label]) => (
              <div key={state}>
                <dt>{label}</dt>
                <dd>
                  {commercial.counts[state as keyof typeof commercial.counts]}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <div className="command-center-grid">
        <section
          className="command-attention"
          aria-labelledby="attention-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Assigned to you</p>
              <h2 id="attention-title">Needs attention</h2>
            </div>
            <span>{attention.pageInfo.total} actionable</span>
          </div>
          <div className="command-attention-list">
            {attention.items.map((item) => (
              <Link
                href={`/app/${workspaceSlug}/projects/${project.key}/work/${item.id}`}
                key={item.id}
              >
                <span>
                  <small>{item.identifier}</small>
                  <strong>{item.title}</strong>
                </span>
                <span>
                  <i className={`priority priority-${item.priority}`}>
                    {item.priority}
                  </i>
                  <small>{item.status.replaceAll("_", " ")}</small>
                </span>
              </Link>
            ))}
            {!attention.items.length ? (
              <p>No actionable project work is assigned to you.</p>
            ) : null}
          </div>
        </section>
        <section className="command-plan" aria-labelledby="plan-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Delivery horizon</p>
              <h2 id="plan-title">Current plan</h2>
            </div>
          </div>
          <dl>
            <div>
              <dt>Cycle</dt>
              <dd>
                {currentCycle ? (
                  <Link
                    href={`/app/${workspaceSlug}/projects/${project.key}/cycles`}
                  >
                    {currentCycle.name}
                  </Link>
                ) : (
                  "No active or planned cycle"
                )}
              </dd>
            </div>
            <div>
              <dt>Milestone</dt>
              <dd>
                {upcomingMilestone
                  ? `${upcomingMilestone.name}${upcomingMilestone.targetDate ? ` · ${upcomingMilestone.targetDate}` : ""}`
                  : "No unfinished milestone"}
              </dd>
            </div>
            <div>
              <dt>Project target</dt>
              <dd>{project.targetDate || "No target date"}</dd>
            </div>
          </dl>
        </section>
        <section className="command-team" aria-labelledby="team-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Project team</p>
              <h2 id="team-title">People</h2>
            </div>
            <span>{projectMembers.length} members</span>
          </div>
          <p className="command-team-lead">
            <span aria-hidden="true">{initials(project.leadName)}</span>
            <strong>{project.leadName}</strong>
            <small>Project lead</small>
          </p>
          <ul>
            {projectMembers
              .filter((member) => member.userId !== project.leadUserId)
              .slice(0, 4)
              .map((member) => (
                <li key={member.userId}>
                  <span aria-hidden="true">{initials(member.name)}</span>
                  {member.name}
                </li>
              ))}
          </ul>
        </section>
      </div>
      {canManage ? (
        <details className="project-editor">
          <summary>Edit project details</summary>
          <form
            action={editProject}
            className="delivery-form delivery-form-grid"
          >
            <AppField
              id="project-name"
              label="Project name"
              required
              className="form-span"
            >
              <AppInput name="name" defaultValue={project.name} />
            </AppField>
            <WorkspaceMemberPicker
              workspaceId={workspaceId}
              name="leadUserId"
              label="Lead"
              initialMembers={uniqueMembers([
                ...projectMembers,
                ...workspaceMembers,
              ])}
              initialPageInfo={workspaceMemberPageInfo}
              defaultValue={project.leadUserId}
            />
            <AppField id="project-start-date" label="Start date">
              <AppInput
                name="startDate"
                type="date"
                defaultValue={project.startDate || ""}
              />
            </AppField>
            <AppField id="project-target-date" label="Target date">
              <AppInput
                name="targetDate"
                type="date"
                defaultValue={project.targetDate || ""}
              />
            </AppField>
            <AppField
              id="project-summary"
              label="Summary"
              hint="Describe the delivery outcome, not internal implementation detail."
              className="form-span"
            >
              <AppTextarea
                name="summary"
                rows={4}
                defaultValue={project.summary || ""}
              />
            </AppField>
            <AppFormActions>
              <AppButton type="submit" disabled={pending} aria-busy={pending}>
                {pending ? "Saving…" : "Save project"}
              </AppButton>
            </AppFormActions>
          </form>
        </details>
      ) : null}
      {message ? <output>{message}</output> : null}
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
                    <span>Name</span>
                    <input name="name" required />
                  </label>
                  <label>
                    <span>Target date</span>
                    <input name="targetDate" type="date" />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea name="description" rows={3} />
                  </label>
                  <button type="submit" disabled={pending}>
                    Create milestone
                  </button>
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
                        <span>Name</span>
                        <input
                          name="name"
                          defaultValue={milestone.name}
                          required
                        />
                      </label>
                      <label>
                        <span>Target date</span>
                        <input
                          name="targetDate"
                          type="date"
                          defaultValue={milestone.targetDate || ""}
                        />
                      </label>
                      <label>
                        <span>Description</span>
                        <textarea
                          name="description"
                          rows={3}
                          defaultValue={milestone.description || ""}
                        />
                      </label>
                      <button type="submit" disabled={pending}>
                        Save milestone
                      </button>
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
                    type="button"
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
          {canManage ? (
            <form action={addMember} className="inline-form">
              <WorkspaceMemberPicker
                workspaceId={workspaceId}
                name="userId"
                label="Add member"
                initialMembers={workspaceMembers}
                initialPageInfo={workspaceMemberPageInfo}
                excludeUserIds={projectMembers.map((member) => member.userId)}
              />
              <button type="submit" disabled={pending}>
                Add
              </button>
            </form>
          ) : null}
          {canManage ? (
            <div className="lifecycle-actions">
              <span>Lifecycle</span>
              {project.lifecycle !== "active" ? (
                <button type="button" onClick={() => updateLifecycle("active")}>
                  Restore
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => updateLifecycle("completed")}
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLifecycle("archived")}
                  >
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
  cycles,
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
  cycles: Cycle[];
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
    filters.labelId ||
    filters.cycleId ||
    filters.query,
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
          <Link href={`/app/${workspaceSlug}/projects/${project.key}/board`}>
            Board
          </Link>
          <Link href={`/app/${workspaceSlug}/projects/${project.key}/cycles`}>
            Cycles
          </Link>
          <Link href={`/app/${workspaceSlug}/projects/${project.key}/brief`}>
            Brief
          </Link>
          <Link
            href={`/app/${workspaceSlug}/projects/${project.key}/commercial`}
          >
            Commercial
          </Link>
          <Link
            href={`/app/${workspaceSlug}/projects/${project.key}/engineering`}
          >
            Engineering &amp; QA
          </Link>
          <Link href={`/app/${workspaceSlug}/projects/${project.key}/activity`}>
            Activity
          </Link>
        </nav>
      </header>
      {message ? <output>{message}</output> : null}
      <div className="backlog-toolbar">
        <form className="backlog-filters">
          {filters.pageSize !== 50 ? (
            <input type="hidden" name="pageSize" value={filters.pageSize} />
          ) : null}
          <input
            name="query"
            type="search"
            aria-label="Search work items"
            placeholder="Search work"
            defaultValue={filters.query || ""}
            maxLength={120}
          />
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
            {filters.assigneeUserId &&
            !members.some(
              (member) => member.userId === filters.assigneeUserId,
            ) ? (
              <option value={filters.assigneeUserId}>
                Unavailable assignee
              </option>
            ) : null}
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
            {filters.milestoneId &&
            !milestones.some(
              (milestone) => milestone.id === filters.milestoneId,
            ) ? (
              <option value={filters.milestoneId}>Unavailable milestone</option>
            ) : null}
            {milestones.map((milestone) => (
              <option value={milestone.id} key={milestone.id}>
                {milestone.name}
              </option>
            ))}
          </select>
          <select
            name="cycleId"
            aria-label="Filter by cycle"
            defaultValue={filters.cycleId || ""}
          >
            <option value="">All cycles</option>
            {filters.cycleId &&
            !cycles.some((cycle) => cycle.id === filters.cycleId) ? (
              <option value={filters.cycleId}>Historical cycle</option>
            ) : null}
            {cycles.map((cycle) => (
              <option value={cycle.id} key={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </select>
          <select
            name="labelId"
            aria-label="Filter by label"
            defaultValue={filters.labelId || ""}
          >
            <option value="">All labels</option>
            {filters.labelId &&
            !labels.some((label) => label.id === filters.labelId) ? (
              <option value={filters.labelId}>Unavailable label</option>
            ) : null}
            {labels.map((label) => (
              <option value={label.id} key={label.id}>
                {label.name}
              </option>
            ))}
          </select>
          <button type="submit" className="button-secondary">
            Apply filters
          </button>
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
            cycles={cycles}
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
                    type="button"
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
                    <span>{item.cycleName || "Backlog / no cycle"}</span>
                    <CommercialProvenanceBadge item={item} />
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
                        type="button"
                        title="Move up"
                        onClick={() => reorder(item, "up")}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
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
            <span>Label name</span>
            <input name="name" required maxLength={40} />
          </label>
          <label>
            <span>Color</span>
            <select name="color">
              {["slate", "blue", "green", "amber", "red", "violet"].map(
                (color) => (
                  <option key={color}>{color}</option>
                ),
              )}
            </select>
          </label>
          <button type="submit" disabled={pending}>
            Create label
          </button>
        </form>
      </details>
      {selected ? (
        <div className="work-editor-backdrop">
          <dialog
            open
            className="work-editor"
            aria-labelledby="work-editor-title"
          >
            <header>
              <div>
                <span className="work-identifier">{selected.identifier}</span>
                <h2 id="work-editor-title">Edit work item</h2>
              </div>
              <button
                type="button"
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
              cycles={cycles}
              labels={labels}
              parents={items.filter(
                (item) => !item.parentId && item.id !== selected.id,
              )}
            />
            <Link
              className="button-secondary collaboration-link"
              href={`/app/${workspaceSlug}/projects/${project.key}/work/${selected.id}`}
            >
              Open discussion and activity
            </Link>
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
                      <button
                        type="button"
                        onClick={() => removeBlock(dependency)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
              <form action={addBlock} className="inline-form">
                <label>
                  <span>This item blocks</span>
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
                <button type="submit" disabled={pending || items.length < 2}>
                  Add dependency
                </button>
              </form>
            </section>
            <button
              type="button"
              className="danger-link"
              onClick={() => archive(selected)}
            >
              Archive work item
            </button>
          </dialog>
        </div>
      ) : null}
    </div>
  );
}

export function WorkItemForm({
  action,
  pending,
  item,
  members,
  milestones,
  cycles,
  labels,
  parents,
}: Readonly<{
  action: (formData: FormData) => void | Promise<void>;
  pending: boolean;
  item?: WorkItem;
  members: Member[];
  milestones: Milestone[];
  cycles: Cycle[];
  labels: Label[];
  parents: WorkItem[];
}>) {
  return (
    <form
      action={action}
      className="delivery-form delivery-form-grid work-form"
    >
      <AppField
        id={item ? `work-title-${item.id}` : "work-title-new"}
        label="Title"
        required
        className="form-span"
      >
        <AppInput name="title" defaultValue={item?.title} maxLength={240} />
      </AppField>
      <AppField
        id={item ? `work-status-${item.id}` : "work-status-new"}
        label="Status"
      >
        <AppSelect name="status" defaultValue={item?.status || "backlog"}>
          {workflow.map(([id, label]) => (
            <option value={id} key={id}>
              {label}
            </option>
          ))}
        </AppSelect>
      </AppField>
      <AppField
        id={item ? `work-priority-${item.id}` : "work-priority-new"}
        label="Priority"
        hint="High and urgent work is emphasized in attention views."
      >
        <AppSelect name="priority" defaultValue={item?.priority || "none"}>
          {["none", "low", "medium", "high", "urgent"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </AppSelect>
      </AppField>
      <label>
        <span>Assignee</span>
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
        <span>Milestone</span>
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
        <span>Cycle</span>
        <select name="cycleId" defaultValue={item?.cycleId || ""}>
          <option value="">Backlog / no cycle</option>
          {item?.cycleId &&
          !cycles.some((cycle) => cycle.id === item.cycleId) ? (
            <option value={item.cycleId}>
              {item.cycleName || "Historical cycle"} (historical)
            </option>
          ) : null}
          {cycles
            .filter(
              (cycle) =>
                cycle.lifecycle === "planned" ||
                cycle.lifecycle === "active" ||
                cycle.id === item?.cycleId,
            )
            .map((cycle) => (
              <option value={cycle.id} key={cycle.id}>
                {cycle.name}
                {cycle.lifecycle === "completed" ||
                cycle.lifecycle === "archived"
                  ? ` (${cycle.lifecycle})`
                  : ""}
              </option>
            ))}
        </select>
      </label>
      <AppField
        id={item ? `work-estimate-${item.id}` : "work-estimate-new"}
        label="Estimate points"
      >
        <AppInput
          name="estimatePoints"
          type="number"
          min={1}
          max={100}
          defaultValue={item?.estimatePoints || ""}
        />
      </AppField>
      <AppField
        id={item ? `work-target-${item.id}` : "work-target-new"}
        label="Target date"
      >
        <AppInput
          name="targetDate"
          type="date"
          defaultValue={item?.targetDate || ""}
        />
      </AppField>
      {item || parents.length ? (
        <label className="form-span">
          <span>Parent work item</span>
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
      <AppField
        id={item ? `work-description-${item.id}` : "work-description-new"}
        label="Description"
        className="form-span"
      >
        <AppTextarea
          name="description"
          rows={5}
          maxLength={10000}
          defaultValue={item?.description || ""}
        />
      </AppField>
      <AppField
        id={item ? `work-acceptance-${item.id}` : "work-acceptance-new"}
        label="Acceptance criteria"
        className="form-span"
        hint="State the factual conditions that define completion."
      >
        <AppTextarea
          name="acceptanceCriteria"
          rows={5}
          maxLength={10000}
          defaultValue={item?.acceptanceCriteria || ""}
        />
      </AppField>
      <AppFormActions>
        <AppButton type="submit" disabled={pending}>
          {item ? "Save changes" : "Create work item"}
        </AppButton>
      </AppFormActions>
    </form>
  );
}

export function backlogPageHref(filters: BacklogFilters, page: number) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.assigneeUserId)
    query.set("assigneeUserId", filters.assigneeUserId);
  if (filters.priority) query.set("priority", filters.priority);
  if (filters.milestoneId) query.set("milestoneId", filters.milestoneId);
  if (filters.cycleId) query.set("cycleId", filters.cycleId);
  if (filters.labelId) query.set("labelId", filters.labelId);
  if (filters.query) query.set("query", filters.query);
  if (filters.pageSize !== 50) query.set("pageSize", String(filters.pageSize));
  query.set("page", String(page));
  return `?${query.toString()}`;
}

function projectDirectoryHref(
  workspaceSlug: string,
  projectPage: number,
  clientPage: number,
  search?: string,
  lifecycle:
    "current" | "active" | "completed" | "archived" | "all" = "current",
) {
  const query = new URLSearchParams({
    page: String(projectPage),
    clientPage: String(clientPage),
  });
  if (search) query.set("query", search);
  if (lifecycle !== "current") query.set("lifecycle", lifecycle);
  return `/app/${workspaceSlug}/projects?${query.toString()}`;
}

type CommercialProvenanceItem = Pick<
  WorkItem,
  | "purpose"
  | "status"
  | "archivedAt"
  | "commercialBasisCount"
  | "commercialHistoricalBasisCount"
  | "commercialStaleBasisCount"
>;

function commercialProvenanceState(
  item: CommercialProvenanceItem,
): [string, string] {
  const historicalWork =
    item.status === "done" ||
    item.status === "canceled" ||
    Boolean(item.archivedAt);
  if (item.purpose === "unclassified") {
    return ["commercial-needs-classification", "Needs classification"];
  }
  if (
    item.purpose === "client_delivery" &&
    historicalWork &&
    (item.commercialHistoricalBasisCount ?? 0) > 0
  ) {
    return ["commercial-historical", "Historically authorized"];
  }
  if (
    item.purpose === "client_delivery" &&
    item.commercialBasisCount === 0 &&
    (item.commercialStaleBasisCount ?? 0) > 0
  ) {
    return ["commercial-stale", "Stale commercial basis"];
  }
  if (item.purpose === "client_delivery" && item.commercialBasisCount === 0) {
    return ["commercial-unlinked", "Commercially unlinked"];
  }
  if (item.purpose === "client_delivery") {
    return ["commercial-linked", "Baseline linked"];
  }
  if (item.purpose === "delivery_support") {
    return ["commercial-support", "Delivery support"];
  }
  return ["commercial-internal", "Internal"];
}

export function CommercialProvenanceBadge({
  item,
}: Readonly<{ item: CommercialProvenanceItem }>) {
  const state = commercialProvenanceState(item);
  return <span className={`commercial-badge ${state[0]}`}>{state[1]}</span>;
}

export function workItemPayload(formData: FormData) {
  const estimate = formText(formData, "estimatePoints");
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
    cycleId: nullable(formData.get("cycleId")),
    parentId: nullable(formData.get("parentId")),
    labelIds: formData
      .getAll("labelIds")
      .filter((value): value is string => typeof value === "string"),
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function nullable(value: FormDataEntryValue | null) {
  return typeof value === "string" && value ? value : null;
}

function uniqueMembers(members: Member[]) {
  return [
    ...new Map(members.map((member) => [member.userId, member])).values(),
  ];
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function apiRequest(url: string, method: string, body: unknown) {
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
