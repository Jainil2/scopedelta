import Link from "next/link";

import type {
  getProjectCommercialExposure,
  listCapacity,
  listCommercialExposure,
  listPortfolio,
  listTimeEntries,
} from "@/server/operations";

type PortfolioData = Awaited<ReturnType<typeof listPortfolio>>;
type CapacityData = Awaited<ReturnType<typeof listCapacity>>;
type TimeData = Awaited<ReturnType<typeof listTimeEntries>>;
type ExposureData = Awaited<ReturnType<typeof listCommercialExposure>>;
type ProjectExposure = Awaited<ReturnType<typeof getProjectCommercialExposure>>;

const attentionLabels = {
  overdue_milestone: "Overdue target",
  client_request: "Open request",
  commercial_drift: "Commercial basis",
  blocked_work: "Blocked work",
  evidence_gap: "Evidence gap",
  unresolved_defect: "Open defect",
  pending_commercial_decision: "Commercial decision",
  pending_acceptance: "Delivery acceptance",
  stale_provider_evidence: "Stale provider evidence",
} as const;

export function OperationsHeader({
  workspaceName,
  workspaceSlug,
  active,
  description,
}: Readonly<{
  workspaceName: string;
  workspaceSlug: string;
  active: "portfolio" | "capacity" | "time" | "exposure";
  description: string;
}>) {
  const tabs = [
    ["portfolio", "Portfolio", `/app/${workspaceSlug}/operations`],
    ["capacity", "Capacity", `/app/${workspaceSlug}/operations/capacity`],
    ["time", "Time", `/app/${workspaceSlug}/operations/time`],
    ["exposure", "Exposure", `/app/${workspaceSlug}/operations/exposure`],
  ] as const;
  return (
    <>
      <header className="app-page-header operations-header">
        <div>
          <p className="app-eyebrow">Operations · {workspaceName}</p>
          <h1>{tabs.find(([key]) => key === active)?.[1]}</h1>
          <p>{description}</p>
        </div>
        <span className="operations-boundary">Local/LAN operating ledger</span>
      </header>
      <nav className="operations-tabs" aria-label="Operations views">
        {tabs.map(([key, label, href]) => (
          <Link
            key={key}
            href={href}
            aria-current={key === active ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function PortfolioLedger({
  data,
  workspaceSlug,
}: Readonly<{ data: PortfolioData; workspaceSlug: string }>) {
  if (!data.items.length) {
    return (
      <EmptyState
        title="No active projects"
        body="The portfolio fills in as active delivery projects are added or filters are relaxed."
        href={`/app/${workspaceSlug}/projects`}
        action="Open projects"
      />
    );
  }
  return (
    <section
      className="operations-ledger"
      aria-label="Project attention ledger"
    >
      <div className="operations-row operations-row-head portfolio-row">
        <span>Project</span>
        <span>Next target</span>
        <span>Attention</span>
      </div>
      {data.items.map((project) => (
        <article className="operations-row portfolio-row" key={project.id}>
          <div data-label="Project">
            <Link href={`/app/${workspaceSlug}/projects/${project.key}`}>
              <strong>{project.key}</strong> · {project.name}
            </Link>
            <small>
              {project.clientName} · {project.leadName}
            </small>
          </div>
          <div data-label="Next target">
            {project.nextMilestoneName ? (
              <>
                <span>{project.nextMilestoneName}</span>
                <small>{project.nextMilestoneTargetDate ?? "No date"}</small>
              </>
            ) : (
              <span className="operations-muted">No open milestone</span>
            )}
          </div>
          <div className="attention-list" data-label="Attention">
            {project.signals.length ? (
              project.signals.map((signal) => (
                <Link
                  className="attention-link"
                  href={signal.href}
                  key={signal.category}
                >
                  {attentionLabels[signal.category]} <span>{signal.count}</span>
                </Link>
              ))
            ) : (
              <span className="operations-clear">No attention</span>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

export function CapacityLedger({ data }: Readonly<{ data: CapacityData }>) {
  if (!data.members.length) {
    return (
      <EmptyState
        title="No allocation data"
        body="No people match this capacity window."
      />
    );
  }
  return (
    <section className="capacity-ledger" aria-label="Weekly capacity ledger">
      {data.members.map((member) => (
        <article className="capacity-person" key={member.id}>
          <header>
            <div>
              <h2>{member.name}</h2>
              <p>{member.email}</p>
            </div>
            <p className="estimate-context">
              Unscheduled work · {member.estimateContext.assignedWorkCount}{" "}
              items · {member.estimateContext.estimatePoints} points
            </p>
          </header>
          <div className="capacity-weeks">
            {member.weeks.map((week) => (
              <details
                className={
                  week.overallocatedMinutes
                    ? "capacity-week is-over"
                    : "capacity-week"
                }
                key={week.week}
              >
                <summary>
                  <span>
                    <strong>{week.week}</strong>
                    <small>ISO week</small>
                  </span>
                  <span>
                    <strong>{formatMinutes(week.availableMinutes)}</strong>
                    <small>Available</small>
                  </span>
                  <span>
                    <strong>{formatMinutes(week.allocatedMinutes)}</strong>
                    <small>Planned</small>
                  </span>
                  <span>
                    <strong>{formatMinutes(week.actualMinutes)}</strong>
                    <small>Actual</small>
                  </span>
                  <span>
                    <strong>{formatMinutes(week.overallocatedMinutes)}</strong>
                    <small>Over</small>
                  </span>
                </summary>
                <div className="capacity-detail">
                  {week.allocations.length ? (
                    week.allocations.map((allocation) => (
                      <p key={allocation.id}>
                        <span>{allocation.projectName}</span>
                        <strong>
                          {formatMinutes(allocation.plannedMinutesPerWeek)}
                        </strong>
                      </p>
                    ))
                  ) : (
                    <p className="operations-muted">No planned allocation.</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

export function TimeLedger({ data }: Readonly<{ data: TimeData }>) {
  return (
    <>
      <dl className="operations-totals">
        <div>
          <dt>Billable actual</dt>
          <dd>{formatMinutes(data.aggregate.billableMinutes)}</dd>
        </div>
        <div>
          <dt>Non-billable actual</dt>
          <dd>{formatMinutes(data.aggregate.nonBillableMinutes)}</dd>
        </div>
      </dl>
      {!data.items.length ? (
        <EmptyState
          title="No delivery time"
          body="Log actual delivery time without changing planned allocations or estimates."
        />
      ) : (
        <section
          className="operations-ledger"
          aria-label="Delivery time entries"
        >
          <div className="operations-row operations-row-head time-row">
            <span>Date</span>
            <span>Work</span>
            <span>Actual</span>
          </div>
          {data.items.map((entry) => (
            <article className="operations-row time-row" key={entry.id}>
              <div data-label="Date">
                <strong>{entry.workDate}</strong>
                <small>{entry.memberName}</small>
              </div>
              <div data-label="Work">
                <strong>
                  {entry.projectKey} · {entry.projectName}
                </strong>
                <small>
                  {entry.workItemNumber
                    ? `#${entry.workItemNumber} ${entry.workItemTitle}`
                    : "Project delivery"}
                </small>
                {entry.note ? <p>{entry.note}</p> : null}
              </div>
              <div data-label="Actual">
                <strong>{formatMinutes(entry.durationMinutes)}</strong>
                <small>
                  {entry.classification === "billable"
                    ? "Billable"
                    : "Non-billable"}
                </small>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

export function ExposureLedger({ data }: Readonly<{ data: ExposureData }>) {
  if (!data.items.length) {
    return (
      <EmptyState
        title="No commercial data"
        body="Exposure appears for led projects with current commercial records or delivery actuals."
      />
    );
  }
  return (
    <section
      className="exposure-ledger"
      aria-label="Commercial exposure ledger"
    >
      {data.items.map((project) => (
        <details className="exposure-project" key={project.id}>
          <summary>
            <span>
              <strong>
                {project.key} · {project.name}
              </strong>
              <small>{project.clientName}</small>
            </span>
            <span>
              <strong>{moneyList(project.summary.confirmed.money)}</strong>
              <small>Confirmed impact</small>
            </span>
            <span>
              <strong>{moneyList(project.summary.pending.money)}</strong>
              <small>Pending exposure</small>
            </span>
            <span>
              <strong>
                {formatMinutes(project.summary.actual.billableMinutes)}
              </strong>
              <small>Billable actual</small>
            </span>
          </summary>
          <div className="exposure-detail">
            <p>
              <span>Effective baseline</span>
              <strong>
                {project.summary.baseline?.label ?? "No effective baseline"}
              </strong>
            </p>
            <p>
              <span>Confirmed effort</span>
              <strong>
                {formatMinutes(project.summary.confirmed.effortMinutes)}
              </strong>
            </p>
            <p>
              <span>Pending effort</span>
              <strong>
                {formatMinutes(project.summary.pending.effortMinutes)}
              </strong>
            </p>
            <p>
              <span>Schedule impacts</span>
              <strong>
                {project.summary.confirmed.scheduleImpactCount} confirmed ·{" "}
                {project.summary.pending.scheduleImpactCount} pending
              </strong>
            </p>
            <p>
              <span>Unresolved requests</span>
              <strong>{project.summary.pending.requestCount}</strong>
            </p>
            <p>
              <span>Non-billable actual</span>
              <strong>
                {formatMinutes(project.summary.actual.nonBillableMinutes)}
              </strong>
            </p>
          </div>
        </details>
      ))}
    </section>
  );
}

export function ProjectExposureSummary({
  summary,
}: Readonly<{ summary: ProjectExposure }>) {
  return (
    <section
      className="commercial-section project-exposure"
      id="commercial-exposure"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Commercial exposure and effort burn</p>
          <h2>Current authoritative position</h2>
        </div>
        <span className="metadata">No baseline money or margin inferred</span>
      </div>
      <dl className="operations-totals">
        <div>
          <dt>Confirmed impact</dt>
          <dd>{moneyList(summary.confirmed.money)}</dd>
        </div>
        <div>
          <dt>Pending exposure</dt>
          <dd>{moneyList(summary.pending.money)}</dd>
        </div>
        <div>
          <dt>Confirmed effort</dt>
          <dd>{formatMinutes(summary.confirmed.effortMinutes)}</dd>
        </div>
        <div>
          <dt>Billable actual</dt>
          <dd>{formatMinutes(summary.actual.billableMinutes)}</dd>
        </div>
        <div>
          <dt>Non-billable actual</dt>
          <dd>{formatMinutes(summary.actual.nonBillableMinutes)}</dd>
        </div>
      </dl>
      <p className="metadata">
        {summary.baseline
          ? `Effective baseline: ${summary.baseline.label}. `
          : "No effective baseline. "}
        {summary.confirmed.scheduleImpactCount} confirmed and{" "}
        {summary.pending.scheduleImpactCount} pending schedule impacts are
        listed as counts, not netted days.
      </p>
    </section>
  );
}

export function EmptyState({
  title,
  body,
  href,
  action,
}: Readonly<{ title: string; body: string; href?: string; action?: string }>) {
  return (
    <section className="operations-empty">
      <p className="section-index">Nothing to reconcile</p>
      <h2>{title}</h2>
      <p>{body}</p>
      {href && action ? <Link href={href}>{action}</Link> : null}
    </section>
  );
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function moneyList(values: Array<{ currencyCode: string; amount: string }>) {
  if (!values.length) return "—";
  return values
    .map((value) => `${value.currencyCode} ${value.amount}`)
    .join(" · ");
}
