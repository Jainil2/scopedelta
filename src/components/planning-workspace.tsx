"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  apiRequest,
  backlogPageHref,
  type BacklogFilters,
  type Cycle,
  type Label,
  type Member,
  type Milestone,
  type PageInfo,
  type Project,
  type WorkItem,
  WorkItemForm,
  workflow,
  workItemPayload,
} from "@/components/delivery-workspace";

type MyWorkItem = Pick<
  WorkItem,
  | "id"
  | "identifier"
  | "parentId"
  | "title"
  | "status"
  | "priority"
  | "targetDate"
  | "estimatePoints"
  | "assigneeUserId"
  | "assigneeName"
  | "milestoneId"
  | "milestoneName"
  | "cycleId"
  | "cycleName"
  | "cycleLifecycle"
  | "labels"
> & {
  projectId: string;
  projectKey: string;
  projectName: string;
  clientName: string;
};

type MyWorkFilters = BacklogFilters & { projectKey?: string };

type MyWorkFacets = {
  projects: Array<{
    projectId: string;
    projectKey: string;
    projectName: string;
    clientName: string;
  }>;
  milestones: Array<{ id: string; name: string; projectKey: string }>;
  cycles: Array<{ id: string; name: string; projectKey: string }>;
  labels: Array<{ id: string; name: string; projectKey: string }>;
};

export function BoardWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  items,
  pageInfo,
  members,
  milestones,
  cycles,
  labels,
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
  filters: BacklogFilters;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const composerRef = useRef<HTMLDetailsElement>(null);
  const filtered = Boolean(
    filters.status ||
    filters.priority ||
    filters.assigneeUserId ||
    filters.milestoneId ||
    filters.labelId ||
    filters.cycleId ||
    filters.query,
  );
  const groups = useMemo(
    () =>
      workflow
        .filter(([status]) => !filters.status || status === filters.status)
        .map(([status, label]) => ({
          status,
          label,
          items: items.filter((item) => item.status === status),
        })),
    [filters.status, items],
  );

  function refresh(text: string) {
    setMessage(text);
    startTransition(() => router.refresh());
  }

  async function patch(item: WorkItem, body: unknown, success: string) {
    setMessage("");
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items/${item.id}`,
      "PATCH",
      body,
    );
    if (response.ok) refresh(success);
    else setMessage(response.message);
  }

  async function create(formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items`,
      "POST",
      workItemPayload(formData),
    );
    if (response.ok) {
      composerRef.current?.querySelector("form")?.reset();
      composerRef.current?.removeAttribute("open");
      refresh("Work item created.");
    } else setMessage(response.message);
  }

  async function reorder(item: WorkItem, direction: "up" | "down") {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items/${item.id}/reorder`,
      "POST",
      { direction },
    );
    if (response.ok) refresh("Board order updated.");
    else setMessage(response.message);
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
      queueMicrotask(() => openerRef.current?.focus());
    } else setMessage(response.message);
  }

  function closeEditor() {
    setSelected(null);
    queueMicrotask(() => openerRef.current?.focus());
  }

  return (
    <div className="delivery-stack planning-workspace">
      <ProjectHeader
        project={project}
        workspaceSlug={workspaceSlug}
        current="board"
        title="Board"
        detail={`${pageInfo.total} active work items`}
      />
      <p className="planning-note">
        Board moves update the same workflow state as the backlog. Changes only
        appear after the server accepts them.
      </p>
      {message ? <p role="status">{message}</p> : null}
      <div className="backlog-toolbar">
        <PlanningFilters
          filters={filters}
          members={members}
          milestones={milestones}
          cycles={cycles}
          labels={labels}
        />
        <details className="delivery-composer" ref={composerRef}>
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
      <div className="kanban-board" aria-label="Project board">
        {groups.map((group) => (
          <section className="kanban-column" key={group.status}>
            <header>
              <h2>{group.label}</h2>
              <span>{group.items.length}</span>
            </header>
            <div className="kanban-stack">
              {group.items.map((item) => {
                const index = workflow.findIndex(([id]) => id === item.status);
                const previous = index > 0 ? workflow[index - 1] : undefined;
                const next =
                  index < workflow.length - 2 ? workflow[index + 1] : undefined;
                return (
                  <article className="kanban-card" key={item.id}>
                    <button
                      className="kanban-card-title"
                      onClick={(event) => {
                        openerRef.current = event.currentTarget;
                        setSelected(item);
                      }}
                    >
                      <span>{item.identifier}</span>
                      <strong>{item.title}</strong>
                    </button>
                    <div className="kanban-card-context">
                      <span className={`priority priority-${item.priority}`}>
                        {item.priority}
                      </span>
                      <span>{item.assigneeName || "Unassigned"}</span>
                      <span>{item.milestoneName || "No milestone"}</span>
                      <span>{item.cycleName || "No cycle"}</span>
                    </div>
                    <form
                      className="kanban-plan-form"
                      action={(formData) =>
                        patch(
                          item,
                          { cycleId: nullable(formData.get("cycleId")) },
                          "Cycle plan updated.",
                        )
                      }
                    >
                      <label>
                        Cycle
                        <select
                          name="cycleId"
                          defaultValue={item.cycleId || ""}
                        >
                          <option value="">Backlog / none</option>
                          {item.cycleId &&
                          !cycles.some((cycle) => cycle.id === item.cycleId) ? (
                            <option value={item.cycleId}>
                              {item.cycleName || "Historical cycle"}{" "}
                              (historical)
                            </option>
                          ) : null}
                          {cycles
                            .filter(
                              (cycle) =>
                                cycle.lifecycle === "planned" ||
                                cycle.lifecycle === "active" ||
                                cycle.id === item.cycleId,
                            )
                            .map((cycle) => (
                              <option value={cycle.id} key={cycle.id}>
                                {cycle.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button disabled={pending}>Plan</button>
                    </form>
                    <div
                      className="kanban-move-actions"
                      aria-label={`Move ${item.identifier}`}
                    >
                      {previous && item.status !== "canceled" ? (
                        <button
                          disabled={pending}
                          onClick={() =>
                            patch(
                              item,
                              { status: previous[0] },
                              `Moved to ${previous[1]}.`,
                            )
                          }
                        >
                          ← {previous[1]}
                        </button>
                      ) : null}
                      {next && item.status !== "canceled" ? (
                        <button
                          disabled={pending}
                          onClick={() =>
                            patch(
                              item,
                              { status: next[0] },
                              `Moved to ${next[1]}.`,
                            )
                          }
                        >
                          {next[1]} →
                        </button>
                      ) : null}
                    </div>
                    {!filtered ? (
                      <div
                        className="reorder-actions"
                        aria-label={`Reorder ${item.identifier}`}
                      >
                        <button
                          disabled={pending}
                          title="Move up"
                          onClick={() => reorder(item, "up")}
                        >
                          ↑
                        </button>
                        <button
                          disabled={pending}
                          title="Move down"
                          onClick={() => reorder(item, "down")}
                        >
                          ↓
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!group.items.length ? (
                <p className="empty-status">No work.</p>
              ) : null}
            </div>
          </section>
        ))}
      </div>
      <PageNavigation
        label="Board pages"
        pageInfo={pageInfo}
        previous={backlogPageHref(filters, pageInfo.page - 1)}
        next={backlogPageHref(filters, pageInfo.page + 1)}
      />
      {selected ? (
        <WorkEditor item={selected} close={closeEditor}>
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
        </WorkEditor>
      ) : null}
    </div>
  );
}

export function CyclesWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  cycles,
  pageInfo,
  lifecycle,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: Project;
  cycles: Cycle[];
  pageInfo: PageInfo;
  lifecycle?: Cycle["lifecycle"];
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const composerRef = useRef<HTMLDetailsElement>(null);

  function refresh(text: string) {
    setMessage(text);
    startTransition(() => router.refresh());
  }

  async function create(formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/cycles`,
      "POST",
      cyclePayload(formData),
    );
    if (response.ok) {
      composerRef.current?.querySelector("form")?.reset();
      composerRef.current?.removeAttribute("open");
      refresh("Cycle created.");
    } else setMessage(response.message);
  }

  async function update(cycle: Cycle, formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${project.id}/cycles/${cycle.id}`,
      "PATCH",
      { ...cyclePayload(formData), lifecycle: formData.get("lifecycle") },
    );
    if (response.ok) refresh("Cycle updated.");
    else setMessage(response.message);
  }

  return (
    <div className="delivery-stack cycles-workspace">
      <ProjectHeader
        project={project}
        workspaceSlug={workspaceSlug}
        current="cycles"
        title="Cycles"
        detail={`${pageInfo.total} planning timeboxes`}
      />
      <p className="planning-note">
        Cycles are optional internal timeboxes. Milestones remain unchanged when
        work is added to or removed from a cycle.
      </p>
      {message ? <p role="status">{message}</p> : null}
      <div className="backlog-toolbar">
        <form className="backlog-filters">
          <select
            name="lifecycle"
            aria-label="Filter cycles"
            defaultValue={lifecycle || ""}
          >
            <option value="">Open cycles</option>
            {cycleLifecycles.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
          <button className="button-secondary">Apply</button>
          {lifecycle ? <Link href="?">Clear</Link> : null}
        </form>
        <details className="delivery-composer" ref={composerRef}>
          <summary>New cycle</summary>
          <CycleForm action={create} pending={pending} />
        </details>
      </div>
      <div className="cycle-list">
        {cycles.map((cycle) => (
          <article className="cycle-row" key={cycle.id}>
            <div className="cycle-sequence">Cycle {cycle.sequence}</div>
            <form
              action={(formData) => update(cycle, formData)}
              className="delivery-form cycle-form"
            >
              <CycleFields cycle={cycle} />
              <label>
                Lifecycle
                <select name="lifecycle" defaultValue={cycle.lifecycle}>
                  {cycleLifecycles.map((value) => (
                    <option value={value} key={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={pending}>Save cycle</button>
            </form>
          </article>
        ))}
        {!cycles.length ? (
          <div className="delivery-empty">
            <h2>{lifecycle ? `No ${lifecycle} cycles` : "No open cycles"}</h2>
            <p>
              This project can continue using milestones and Kanban without
              cycles.
            </p>
          </div>
        ) : null}
      </div>
      <PageNavigation
        label="Cycle pages"
        pageInfo={pageInfo}
        previous={cyclePageHref(lifecycle, pageInfo.page - 1)}
        next={cyclePageHref(lifecycle, pageInfo.page + 1)}
      />
    </div>
  );
}

export function MyWorkWorkspace({
  workspaceId,
  workspaceSlug,
  items,
  pageInfo,
  filters,
  facets,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  items: MyWorkItem[];
  pageInfo: PageInfo;
  filters: MyWorkFilters;
  facets: MyWorkFacets;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  async function changeStatus(item: MyWorkItem, formData: FormData) {
    const response = await apiRequest(
      `/api/v1/workspaces/${workspaceId}/projects/${item.projectId}/work-items/${item.id}`,
      "PATCH",
      { status: formData.get("status") },
    );
    setMessage(response.ok ? "Work status updated." : response.message);
    if (response.ok) startTransition(() => router.refresh());
  }

  return (
    <div className="delivery-stack my-workspace">
      <header className="delivery-page-header">
        <div>
          <p className="eyebrow">Daily execution</p>
          <h1>My work</h1>
          <p>
            {pageInfo.total} actionable assignments across active, authorized
            projects.
          </p>
        </div>
      </header>
      {message ? <p role="status">{message}</p> : null}
      <form className="my-work-filters">
        <input
          type="search"
          name="query"
          aria-label="Search my work"
          placeholder="Search work or project"
          defaultValue={filters.query || ""}
          maxLength={120}
        />
        <select
          name="projectKey"
          aria-label="Filter by project"
          defaultValue={filters.projectKey || ""}
        >
          <option value="">All projects</option>
          {filters.projectKey &&
          !facets.projects.some(
            (project) => project.projectKey === filters.projectKey,
          ) ? (
            <option value={filters.projectKey}>Unavailable project</option>
          ) : null}
          {facets.projects.map((project) => (
            <option value={project.projectKey} key={project.projectId}>
              {project.projectKey} · {project.projectName}
            </option>
          ))}
        </select>
        <select
          name="status"
          aria-label="Filter by status"
          defaultValue={filters.status || ""}
        >
          <option value="">Actionable statuses</option>
          {workflow.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="priority"
          aria-label="Filter by priority"
          defaultValue={filters.priority || ""}
        >
          <option value="">All priorities</option>
          {["urgent", "high", "medium", "low", "none"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <FacetSelect
          name="milestoneId"
          label="milestone"
          value={filters.milestoneId}
          options={facets.milestones}
        />
        <FacetSelect
          name="cycleId"
          label="cycle"
          value={filters.cycleId}
          options={facets.cycles}
        />
        <FacetSelect
          name="labelId"
          label="label"
          value={filters.labelId}
          options={facets.labels}
        />
        <button className="button-secondary">Apply filters</button>
        {hasMyWorkFilters(filters) ? (
          <Link href={`/app/${workspaceSlug}/my-work`}>Clear</Link>
        ) : null}
      </form>
      <div className="my-work-list">
        {items.map((item) => (
          <article className="my-work-row" key={item.id}>
            <div className="my-work-project">
              <span className="project-key">{item.projectKey}</span>
              <span>{item.clientName}</span>
            </div>
            <Link
              className="my-work-title"
              href={`/app/${workspaceSlug}/projects/${item.projectKey}/backlog?query=${encodeURIComponent(item.identifier)}`}
            >
              <span>{item.identifier}</span>
              <strong>{item.title}</strong>
            </Link>
            <div className="work-metadata">
              <span className={`priority priority-${item.priority}`}>
                {item.priority}
              </span>
              <span>{item.milestoneName || "No milestone"}</span>
              <span>{item.cycleName || "No cycle"}</span>
              <span>{item.targetDate || "No target date"}</span>
            </div>
            <form
              action={(formData) => changeStatus(item, formData)}
              className="my-work-status"
            >
              <label>
                Status
                <select
                  name="status"
                  defaultValue={item.status}
                  disabled={item.status === "canceled"}
                >
                  {workflow.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={pending || item.status === "canceled"}>
                Update
              </button>
            </form>
          </article>
        ))}
        {!items.length ? (
          <div className="delivery-empty">
            <h2>No matching work</h2>
            <p>
              Assigned work appears here only while its client project remains
              active and accessible.
            </p>
          </div>
        ) : null}
      </div>
      <PageNavigation
        label="My work pages"
        pageInfo={pageInfo}
        previous={myWorkPageHref(filters, pageInfo.page - 1)}
        next={myWorkPageHref(filters, pageInfo.page + 1)}
      />
    </div>
  );
}

function PlanningFilters({
  filters,
  members,
  milestones,
  cycles,
  labels,
}: Readonly<{
  filters: BacklogFilters;
  members: Member[];
  milestones: Milestone[];
  cycles: Cycle[];
  labels: Label[];
}>) {
  return (
    <form className="backlog-filters">
      {filters.pageSize !== 100 ? (
        <input type="hidden" name="pageSize" value={filters.pageSize} />
      ) : null}
      <input
        type="search"
        name="query"
        aria-label="Search board"
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
        {workflow.map(([value, label]) => (
          <option value={value} key={value}>
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
        !members.some((member) => member.userId === filters.assigneeUserId) ? (
          <option value={filters.assigneeUserId}>Unavailable assignee</option>
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
        {["urgent", "high", "medium", "low", "none"].map((value) => (
          <option key={value}>{value}</option>
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
      <button className="button-secondary">Apply filters</button>
    </form>
  );
}

function ProjectHeader({
  project,
  workspaceSlug,
  current,
  title,
  detail,
}: Readonly<{
  project: Project;
  workspaceSlug: string;
  current: "board" | "cycles";
  title: string;
  detail: string;
}>) {
  return (
    <header className="project-header">
      <div>
        <p className="eyebrow">{project.clientName}</p>
        <div className="delivery-row-title">
          <span className="project-key">{project.key}</span>
          <h1>{title}</h1>
        </div>
        <p>
          {detail} · {project.name}
        </p>
      </div>
      <ProjectTabs
        workspaceSlug={workspaceSlug}
        projectKey={project.key}
        current={current}
      />
    </header>
  );
}

export function ProjectTabs({
  workspaceSlug,
  projectKey,
  current,
}: Readonly<{
  workspaceSlug: string;
  projectKey: string;
  current: "overview" | "backlog" | "board" | "cycles";
}>) {
  const tabs = [
    ["overview", "Overview", `/app/${workspaceSlug}/projects/${projectKey}`],
    [
      "backlog",
      "Backlog",
      `/app/${workspaceSlug}/projects/${projectKey}/backlog`,
    ],
    ["board", "Board", `/app/${workspaceSlug}/projects/${projectKey}/board`],
    ["cycles", "Cycles", `/app/${workspaceSlug}/projects/${projectKey}/cycles`],
  ] as const;
  return (
    <nav className="project-tabs" aria-label="Project">
      {tabs.map(([id, label, href]) => (
        <Link
          href={href}
          key={id}
          aria-current={id === current ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function WorkEditor({
  item,
  close,
  children,
}: Readonly<{ item: WorkItem; close: () => void; children: React.ReactNode }>) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);
  return (
    <div className="work-editor-backdrop" role="presentation">
      <section
        className="work-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-editor-title"
      >
        <header>
          <div>
            <span className="work-identifier">{item.identifier}</span>
            <h2 id="planning-editor-title">Edit work item</h2>
          </div>
          <button ref={closeRef} className="button-secondary" onClick={close}>
            Close
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function CycleForm({
  action,
  pending,
}: Readonly<{
  action: (data: FormData) => void | Promise<void>;
  pending: boolean;
}>) {
  return (
    <form action={action} className="delivery-form cycle-form">
      <CycleFields />
      <button disabled={pending}>Create cycle</button>
    </form>
  );
}

function CycleFields({ cycle }: Readonly<{ cycle?: Cycle }>) {
  return (
    <>
      <label>
        Cycle name
        <input
          name="name"
          required
          minLength={2}
          maxLength={160}
          defaultValue={cycle?.name}
        />
      </label>
      <div className="delivery-form-grid">
        <label>
          Start date
          <input
            name="startDate"
            type="date"
            required
            defaultValue={cycle?.startDate}
          />
        </label>
        <label>
          End date
          <input
            name="endDate"
            type="date"
            required
            defaultValue={cycle?.endDate}
          />
        </label>
      </div>
      <label>
        Goal / summary
        <textarea
          name="goal"
          rows={3}
          maxLength={5000}
          defaultValue={cycle?.goal || ""}
        />
      </label>
    </>
  );
}

function FacetSelect({
  name,
  label,
  value,
  options,
}: Readonly<{
  name: string;
  label: string;
  value?: string;
  options: Array<{ id: string; name: string; projectKey: string }>;
}>) {
  return (
    <select
      name={name}
      aria-label={`Filter by ${label}`}
      defaultValue={value || ""}
    >
      <option value="">All {label}s</option>
      {value && !options.some((option) => option.id === value) ? (
        <option value={value}>Unavailable {label}</option>
      ) : null}
      {options.map((option) => (
        <option value={option.id} key={option.id}>
          {option.projectKey} · {option.name}
        </option>
      ))}
    </select>
  );
}

function PageNavigation({
  label,
  pageInfo,
  previous,
  next,
}: Readonly<{
  label: string;
  pageInfo: PageInfo;
  previous: string;
  next: string;
}>) {
  return (
    <nav className="pagination" aria-label={label}>
      {pageInfo.page > 1 ? <Link href={previous}>Previous</Link> : <span />}
      <span>Page {pageInfo.page}</span>
      {pageInfo.hasNextPage ? <Link href={next}>Next</Link> : <span />}
    </nav>
  );
}

const cycleLifecycles = ["planned", "active", "completed", "archived"] as const;

function cyclePayload(formData: FormData) {
  return {
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    goal: formData.get("goal"),
  };
}

function cyclePageHref(
  lifecycle: Cycle["lifecycle"] | undefined,
  page: number,
) {
  const query = new URLSearchParams({ page: String(page) });
  if (lifecycle) query.set("lifecycle", lifecycle);
  return `?${query.toString()}`;
}

function myWorkPageHref(filters: MyWorkFilters, page: number) {
  const query = new URLSearchParams();
  if (filters.query) query.set("query", filters.query);
  if (filters.projectKey) query.set("projectKey", filters.projectKey);
  if (filters.status) query.set("status", filters.status);
  if (filters.priority) query.set("priority", filters.priority);
  if (filters.milestoneId) query.set("milestoneId", filters.milestoneId);
  if (filters.cycleId) query.set("cycleId", filters.cycleId);
  if (filters.labelId) query.set("labelId", filters.labelId);
  if (filters.pageSize !== 50) query.set("pageSize", String(filters.pageSize));
  query.set("page", String(page));
  return `?${query.toString()}`;
}

function hasMyWorkFilters(filters: MyWorkFilters) {
  return Boolean(
    filters.query ||
    filters.projectKey ||
    filters.status ||
    filters.priority ||
    filters.milestoneId ||
    filters.cycleId ||
    filters.labelId,
  );
}

function nullable(value: FormDataEntryValue | null) {
  return value ? String(value) : null;
}
