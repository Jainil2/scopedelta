"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { apiRequest } from "@/components/delivery-workspace";
import { ProjectTabs } from "@/components/planning-workspace";

type DateValue = string | Date | null;

type EngineeringData = {
  configuration: {
    githubConfigured: boolean;
  };
  canManageConnections: boolean;
  repositories: Array<{
    id: string;
    provider: "github";
    fullName: string;
    url: string;
    defaultBranch: string;
    private: boolean;
    state: "active" | "disconnected" | "revoked";
    lastSyncedAt: DateValue;
    staleAt: DateValue;
    lastSyncErrorCode: string | null;
  }>;
  artifacts: Array<{
    id: string;
    repositoryId: string;
    number: number;
    url: string;
    title: string;
    state: "open" | "draft" | "closed" | "merged";
    headRef: string | null;
    headSha: string | null;
    baseBranch: string;
    authorRef: string | null;
    reviewRollup: "pending" | "approved" | "changes_requested" | "unknown";
    approvalsCount: number;
    changesRequestedCount: number;
    checkRollup: "pending" | "passing" | "failing" | "unknown";
    mergedAt: DateValue;
    mergeCommitSha: string | null;
    providerUpdatedAt: DateValue;
    syncedAt: DateValue;
    staleAt: DateValue;
  }>;
  links: Array<{
    id: string;
    workItemId: string;
    artifactId: string;
    provenance: "manual" | "provider_key";
  }>;
  workItems: Array<{
    id: string;
    number: number;
    title: string;
    status: string;
    purpose: string;
    milestoneId: string | null;
  }>;
  verifications: Array<{
    id: string;
    workItemId: string | null;
    scopeItemRevisionId: string | null;
    artifactId: string | null;
    milestoneId: string | null;
    acceptanceTargetId: string | null;
    method: "manual" | "automated_reference";
    category: string;
    result: "pending" | "passed" | "failed" | "blocked";
    referenceUrl: string | null;
    notes: string | null;
    recordedByName: string;
    recordedAt: DateValue;
    stale: boolean;
  }>;
  defects: Array<{
    id: string;
    number: number;
    title: string;
    description: string | null;
    status: "open" | "resolved";
    severity: "low" | "medium" | "high" | "critical";
    workItemId: string | null;
    artifactId: string | null;
    verificationId: string | null;
    detectedAt: DateValue;
    resolvedAt: DateValue;
  }>;
  milestones: Array<{ id: string; name: string; status: string }>;
  scopeItems: Array<{ id: string; title: string; kind: string }>;
  requests: Array<{ id: string; title: string }>;
  acceptanceTargets: Array<{ id: string; title: string }>;
};

type Coverage = {
  summary: Record<string, number>;
  items: Array<{
    workItemId: string | null;
    identifier: string;
    title: string;
    milestoneId: string | null;
    gaps: string[];
  }>;
  page: { number: number; size: number; total: number; pages: number };
  truncated: boolean;
};

function EngineeringStatusMessages({
  message,
  pending,
}: Readonly<{ message: string; pending: boolean }>) {
  return (
    <>
      {message ? (
        <output className="commercial-message">{message}</output>
      ) : null}
      {pending ? <output>Refreshing delivery evidence…</output> : null}
    </>
  );
}

export function EngineeringWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  engineering,
  coverage,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: { id: string; key: string; name: string; clientName: string };
  engineering: EngineeringData;
  coverage: Coverage;
}>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const base = `/api/v1/workspaces/${workspaceId}/projects/${project.id}/engineering`;

  function refresh(messageText: string) {
    setMessage(messageText);
    startTransition(() => router.refresh());
  }

  async function connectRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const repositoryFullName = new FormData(event.currentTarget).get(
      "repositoryFullName",
    );
    if (typeof repositoryFullName !== "string") return;
    const url = new URL(`${base}/github/install`, window.location.origin);
    url.searchParams.set("repositoryFullName", repositoryFullName);
    window.location.assign(url);
  }

  async function repositoryAction(
    repositoryId: string,
    action: "reconcile" | "disconnect",
  ) {
    const response = await apiRequest(
      action === "reconcile"
        ? `${base}/repositories/${repositoryId}/reconcile`
        : `${base}/repositories/${repositoryId}`,
      action === "reconcile" ? "POST" : "DELETE",
      {},
    );
    if (response.ok)
      refresh(
        action === "reconcile"
          ? "Evidence refreshed."
          : "Repository disconnected; historical evidence was preserved.",
      );
    else setMessage(response.message);
  }

  async function linkEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await apiRequest(`${base}/links`, "POST", {
      workItemId: data.get("workItemId"),
      artifactId: data.get("artifactId"),
    });
    if (response.ok) refresh("Implementation evidence linked.");
    else setMessage(response.message);
  }

  async function unlinkEvidence(linkId: string) {
    const response = await apiRequest(`${base}/links/${linkId}`, "DELETE", {});
    if (response.ok) refresh("Implementation evidence unlinked.");
    else setMessage(response.message);
  }

  async function recordVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await apiRequest(`${base}/verifications`, "POST", {
      workItemId: nullable(data.get("workItemId")),
      artifactId: nullable(data.get("artifactId")),
      method: data.get("method"),
      category: data.get("category"),
      result: data.get("result"),
      referenceUrl: nullable(data.get("referenceUrl")),
      notes: nullable(data.get("notes")),
    });
    if (response.ok) {
      form.reset();
      refresh("Verification evidence recorded.");
    } else setMessage(response.message);
  }

  async function recordDefect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await apiRequest(`${base}/defects`, "POST", {
      title: data.get("title"),
      description: nullable(data.get("description")),
      severity: data.get("severity"),
      workItemId: nullable(data.get("workItemId")),
      artifactId: nullable(data.get("artifactId")),
      verificationId: nullable(data.get("verificationId")),
    });
    if (response.ok) {
      form.reset();
      refresh("Defect evidence recorded.");
    } else setMessage(response.message);
  }

  async function toggleDefect(defect: EngineeringData["defects"][number]) {
    const status = defect.status === "open" ? "resolved" : "open";
    const response = await apiRequest(`${base}/defects/${defect.id}`, "PATCH", {
      status,
    });
    if (response.ok) refresh(`Defect marked ${status}.`);
    else setMessage(response.message);
  }

  const repositoryById = new Map(
    engineering.repositories.map((repository) => [repository.id, repository]),
  );
  const workById = new Map(
    engineering.workItems.map((work) => [work.id, work]),
  );
  const artifactById = new Map(
    engineering.artifacts.map((artifact) => [artifact.id, artifact]),
  );

  return (
    <div className="delivery-stack engineering-page">
      <header className="project-header engineering-header">
        <div>
          <p className="eyebrow">{project.clientName}</p>
          <div className="delivery-row-title">
            <span className="project-key">{project.key}</span>
            <h1>Engineering &amp; QA evidence</h1>
          </div>
          <p>
            Factual delivery evidence from authorization through implementation,
            verification, defects, and client acceptance.
          </p>
        </div>
        <ProjectTabs
          workspaceSlug={workspaceSlug}
          projectKey={project.key}
          current="engineering"
        />
      </header>

      <EngineeringStatusMessages message={message} pending={pending} />

      <section
        className="engineering-status-strip"
        aria-label="Release readiness gaps"
      >
        <ReadinessStat
          label="Incomplete work"
          value={coverage.summary.incompleteMaterialWork ?? 0}
        />
        <ReadinessStat
          label="Missing implementation"
          value={coverage.summary.missingImplementation ?? 0}
        />
        <ReadinessStat
          label="Check risks"
          value={
            (coverage.summary.failingChecks ?? 0) +
            (coverage.summary.pendingChecks ?? 0) +
            (coverage.summary.unknownChecks ?? 0)
          }
        />
        <ReadinessStat
          label="Verification gaps"
          value={
            (coverage.summary.missingVerification ?? 0) +
            (coverage.summary.failedVerification ?? 0) +
            (coverage.summary.blockedVerification ?? 0) +
            (coverage.summary.staleVerification ?? 0)
          }
        />
        <ReadinessStat
          label="Open defects"
          value={coverage.summary.unresolvedDefects ?? 0}
        />
        <ReadinessStat
          label="Pending acceptance"
          value={coverage.summary.pendingAcceptance ?? 0}
        />
      </section>

      <section className="engineering-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Provider boundary</p>
            <h2>Connected GitHub repositories</h2>
          </div>
          <span className="commercial-badge">Read-only metadata</span>
        </div>
        <p>
          ScopeDelta stores normalized PR/review/check snapshots only. Source,
          diffs, complete logs, and provider credentials stay outside the graph.
        </p>
        {engineering.canManageConnections ? (
          <details className="project-editor">
            <summary>Connect an explicitly granted repository</summary>
            {!engineering.configuration.githubConfigured ? (
              <p>
                Configure the server-side GitHub App environment before
                connecting.
              </p>
            ) : null}
            <p>
              GitHub will ask you to install or configure the app, then verify
              that your GitHub user can access this exact granted repository.
            </p>
            <form
              className="delivery-form delivery-form-grid"
              onSubmit={connectRepository}
            >
              <label>
                <span>Granted repository</span>
                <input
                  name="repositoryFullName"
                  placeholder="owner/repository"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={
                  !engineering.configuration.githubConfigured || pending
                }
              >
                Authorize repository with GitHub
              </button>
            </form>
          </details>
        ) : null}
        <div className="engineering-card-list">
          {engineering.repositories.map((repository) => (
            <article className="engineering-card" key={repository.id}>
              <div>
                <h3>
                  <a href={repository.url} target="_blank" rel="noreferrer">
                    {repository.fullName}
                  </a>
                </h3>
                <p>
                  {repository.private ? "Private" : "Public"} · default{" "}
                  {repository.defaultBranch}
                </p>
                <p>
                  {repository.state === "active" ? "Connected" : "Disconnected"}
                  {repository.staleAt ? " · evidence stale/unknown" : ""}
                  {repository.lastSyncedAt
                    ? ` · synced ${formatDate(repository.lastSyncedAt)}`
                    : " · not yet synced"}
                </p>
              </div>
              {repository.state === "active" ? (
                <div className="commercial-row-actions">
                  <button
                    type="button"
                    onClick={() => repositoryAction(repository.id, "reconcile")}
                  >
                    Refresh
                  </button>
                  {engineering.canManageConnections ? (
                    <button
                      type="button"
                      onClick={() =>
                        repositoryAction(repository.id, "disconnect")
                      }
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
          {!engineering.repositories.length ? (
            <p>
              No GitHub repository is connected. Local QA, defects, and
              readiness remain available.
            </p>
          ) : null}
        </div>
      </section>

      <div className="engineering-grid">
        <section className="engineering-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Implementation</p>
              <h2>Pull-request evidence</h2>
            </div>
          </div>
          <form className="engineering-inline-form" onSubmit={linkEvidence}>
            <label>
              <span>Work item</span>
              <select name="workItemId" required defaultValue="">
                <option value="" disabled>
                  Choose work
                </option>
                {engineering.workItems.map((work) => (
                  <option key={work.id} value={work.id}>
                    {project.key}-{work.number} · {work.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Pull request</span>
              <select name="artifactId" required defaultValue="">
                <option value="" disabled>
                  Choose evidence
                </option>
                {engineering.artifacts.map((artifact) => (
                  <option key={artifact.id} value={artifact.id}>
                    #{artifact.number} · {artifact.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Link evidence</button>
          </form>
          <div className="engineering-card-list">
            {engineering.artifacts.map((artifact) => {
              const repository = repositoryById.get(artifact.repositoryId);
              const links = engineering.links.filter(
                (link) => link.artifactId === artifact.id,
              );
              return (
                <article className="engineering-card" key={artifact.id}>
                  <div className="engineering-card-title">
                    <div>
                      <p className="eyebrow">
                        {repository?.fullName ?? "Repository"} · PR #
                        {artifact.number}
                      </p>
                      <h3>
                        <a href={artifact.url} target="_blank" rel="noreferrer">
                          {artifact.title}
                        </a>
                      </h3>
                    </div>
                    <span
                      className={`engineering-state engineering-${artifact.staleAt ? "unknown" : artifact.checkRollup}`}
                    >
                      {artifact.staleAt
                        ? "stale / unknown"
                        : artifact.checkRollup}
                    </span>
                  </div>
                  <p>
                    {artifact.state} · review {artifact.reviewRollup} ·{" "}
                    {artifact.approvalsCount} approval(s)
                  </p>
                  <p>
                    <code>{artifact.headRef ?? "unknown head"}</code> →{" "}
                    <code>{artifact.baseBranch}</code>
                    {artifact.headSha
                      ? ` · ${artifact.headSha.slice(0, 8)}`
                      : ""}
                  </p>
                  <div className="engineering-link-list">
                    {links.map((link) => {
                      const work = workById.get(link.workItemId);
                      return (
                        <span key={link.id}>
                          <Link
                            href={`/app/${workspaceSlug}/projects/${project.key}/work/${link.workItemId}`}
                          >
                            {work
                              ? `${project.key}-${work.number}`
                              : "Work item"}
                          </Link>{" "}
                          ·{" "}
                          {link.provenance === "manual"
                            ? "manual"
                            : "key-linked"}{" "}
                          <button
                            type="button"
                            onClick={() => unlinkEvidence(link.id)}
                          >
                            Unlink
                          </button>
                        </span>
                      );
                    })}
                    {!links.length ? (
                      <span>Unlinked — choose the exact work item above.</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {!engineering.artifacts.length ? (
              <p>No implementation evidence synchronized yet.</p>
            ) : null}
          </div>
        </section>

        <section className="engineering-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">QA</p>
              <h2>Verification evidence</h2>
            </div>
          </div>
          <details
            className="project-editor"
            open={!engineering.verifications.length}
          >
            <summary>Record verification</summary>
            <form
              className="delivery-form delivery-form-grid"
              onSubmit={recordVerification}
            >
              <label>
                <span>Work item</span>
                <select name="workItemId" required defaultValue="">
                  <option value="" disabled>
                    Choose work
                  </option>
                  {engineering.workItems.map((work) => (
                    <option key={work.id} value={work.id}>
                      {project.key}-{work.number} · {work.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Implementation version</span>
                <select name="artifactId" defaultValue="">
                  <option value="">No provider evidence</option>
                  {engineering.artifacts.map((artifact) => (
                    <option key={artifact.id} value={artifact.id}>
                      PR #{artifact.number} ·{" "}
                      {artifact.headSha?.slice(0, 8) ?? "unknown head"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Method</span>
                <select name="method" defaultValue="manual">
                  <option value="manual">Manual QA</option>
                  <option value="automated_reference">
                    Automated evidence reference
                  </option>
                </select>
              </label>
              <label>
                <span>Result</span>
                <select name="result" defaultValue="pending">
                  <option value="pending">Pending</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </label>
              <label>
                <span>Category</span>
                <input
                  name="category"
                  placeholder="Regression, acceptance, security…"
                  required
                  maxLength={80}
                />
              </label>
              <label>
                <span>Evidence URL</span>
                <input name="referenceUrl" type="url" />
              </label>
              <label className="form-span">
                <span>Concise notes</span>
                <textarea name="notes" rows={3} maxLength={5000} />
              </label>
              <button type="submit">Record verification</button>
            </form>
          </details>
          <div className="engineering-card-list">
            {engineering.verifications.map((verification) => {
              const work = verification.workItemId
                ? workById.get(verification.workItemId)
                : null;
              return (
                <article className="engineering-card" key={verification.id}>
                  <div className="engineering-card-title">
                    <h3>{verification.category}</h3>
                    <span
                      className={`engineering-state engineering-${verification.stale ? "unknown" : verification.result}`}
                    >
                      {verification.stale ? "stale" : verification.result}
                    </span>
                  </div>
                  <p>
                    {verification.method === "manual"
                      ? "Manual QA"
                      : "Automated reference"}{" "}
                    · {verification.recordedByName} ·{" "}
                    {formatDate(verification.recordedAt)}
                  </p>
                  {work ? (
                    <p>
                      <Link
                        href={`/app/${workspaceSlug}/projects/${project.key}/work/${work.id}`}
                      >
                        {project.key}-{work.number} · {work.title}
                      </Link>
                    </p>
                  ) : null}
                  {verification.notes ? <p>{verification.notes}</p> : null}
                  {verification.referenceUrl ? (
                    <a
                      href={verification.referenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open bounded evidence reference
                    </a>
                  ) : null}
                </article>
              );
            })}
            {!engineering.verifications.length ? (
              <p>No QA verification has been recorded.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="engineering-grid">
        <section className="engineering-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Defects</p>
              <h2>Delivery defect evidence</h2>
            </div>
          </div>
          <details
            className="project-editor"
            open={!engineering.defects.length}
          >
            <summary>Record a defect</summary>
            <form
              className="delivery-form delivery-form-grid"
              onSubmit={recordDefect}
            >
              <label className="form-span">
                <span>Title</span>
                <input name="title" required maxLength={240} />
              </label>
              <label>
                <span>Severity</span>
                <select name="severity" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
              <label>
                <span>Work item</span>
                <select name="workItemId" defaultValue="">
                  <option value="">Project-level defect</option>
                  {engineering.workItems.map((work) => (
                    <option key={work.id} value={work.id}>
                      {project.key}-{work.number} · {work.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Implementation evidence</span>
                <select name="artifactId" defaultValue="">
                  <option value="">None</option>
                  {engineering.artifacts.map((artifact) => (
                    <option key={artifact.id} value={artifact.id}>
                      PR #{artifact.number}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Verification evidence</span>
                <select name="verificationId" defaultValue="">
                  <option value="">None</option>
                  {engineering.verifications.map((verification) => (
                    <option key={verification.id} value={verification.id}>
                      {verification.category} · {verification.result}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-span">
                <span>Description</span>
                <textarea name="description" rows={3} maxLength={10000} />
              </label>
              <button type="submit">Record defect</button>
            </form>
          </details>
          <div className="engineering-card-list">
            {engineering.defects.map((defect) => {
              const work = defect.workItemId
                ? workById.get(defect.workItemId)
                : null;
              const artifact = defect.artifactId
                ? artifactById.get(defect.artifactId)
                : null;
              return (
                <article className="engineering-card" key={defect.id}>
                  <div className="engineering-card-title">
                    <div>
                      <p className="eyebrow">
                        DEF-{defect.number} · {defect.severity}
                      </p>
                      <h3>{defect.title}</h3>
                    </div>
                    <span
                      className={`engineering-state engineering-${defect.status === "open" ? "failing" : "passing"}`}
                    >
                      {defect.status}
                    </span>
                  </div>
                  {defect.description ? <p>{defect.description}</p> : null}
                  <p>
                    {work ? `${project.key}-${work.number}` : "Project"}
                    {artifact ? ` · PR #${artifact.number}` : ""} · detected{" "}
                    {formatDate(defect.detectedAt)}
                  </p>
                  <button type="button" onClick={() => toggleDefect(defect)}>
                    {defect.status === "open"
                      ? "Resolve defect"
                      : "Reopen defect"}
                  </button>
                </article>
              );
            })}
            {!engineering.defects.length ? (
              <p>No defects are recorded.</p>
            ) : null}
          </div>
        </section>

        <section className="engineering-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Coverage</p>
              <h2>Release readiness explanations</h2>
            </div>
            <span>{coverage.page.total} item(s)</span>
          </div>
          <p>
            Advisory evidence gaps only. There is no opaque score and no
            automatic commercial or client-state mutation.
          </p>
          {coverage.truncated ? (
            <p className="commercial-message">
              This bounded view reached a project evidence limit. Narrow by
              milestone or reconcile smaller batches.
            </p>
          ) : null}
          <div className="engineering-card-list">
            {coverage.items.map((item, index) => (
              <article
                className="engineering-card"
                key={`${item.workItemId ?? "requirement"}-${index}`}
              >
                <h3>
                  {item.workItemId ? (
                    <Link
                      href={`/app/${workspaceSlug}/projects/${project.key}/work/${item.workItemId}`}
                    >
                      {item.identifier} · {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </h3>
                <div className="engineering-gap-list">
                  {item.gaps.map((gap) => (
                    <span key={gap}>{gapLabel(gap)}</span>
                  ))}
                </div>
              </article>
            ))}
            {!coverage.items.length ? (
              <p>
                No current evidence gaps were found for material delivery work.
              </p>
            ) : null}
          </div>
          {coverage.page.pages > 1 ? (
            <nav className="pagination" aria-label="Readiness pages">
              {coverage.page.number > 1 ? (
                <Link href={`?page=${coverage.page.number - 1}`}>Newer</Link>
              ) : (
                <span />
              )}
              {coverage.page.number < coverage.page.pages ? (
                <Link href={`?page=${coverage.page.number + 1}`}>Older</Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ReadinessStat({
  label,
  value,
}: Readonly<{ label: string; value: number }>) {
  return (
    <div className={value ? "status-critical" : ""}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function nullable(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type DeliveryEvidenceTrace = {
  work: { identifier: string };
  implementation: Array<{
    artifactId: string;
    number: number;
    title: string;
    url: string;
    state: string;
    reviewRollup: string;
    checkRollup: string;
    staleAt: DateValue;
  }>;
  verification: Array<{
    id: string;
    category: string;
    result: string;
    notes: string | null;
    referenceUrl: string | null;
    recordedAt: DateValue;
  }>;
  defects: Array<{
    id: string;
    number: number;
    title: string;
    status: string;
    severity: string;
  }>;
  acceptance: Array<{
    id: string;
    title: string;
    version: number;
    action: string | null;
    actedAt: DateValue;
  }>;
};

export function WorkEngineeringPanel({
  trace,
}: Readonly<{ trace: DeliveryEvidenceTrace }>) {
  return (
    <section className="commercial-provenance engineering-work-trace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Engineering &amp; QA evidence</p>
          <h2>{trace.work.identifier} delivery trace</h2>
        </div>
      </div>
      <div className="engineering-work-trace-grid">
        <div>
          <h3>Implementation</h3>
          {trace.implementation.map((artifact) => (
            <p key={artifact.artifactId}>
              <a href={artifact.url} target="_blank" rel="noreferrer">
                PR #{artifact.number} · {artifact.title}
              </a>{" "}
              · {artifact.state} · review {artifact.reviewRollup} · checks{" "}
              {artifact.checkRollup}
              {artifact.staleAt ? " · stale" : ""}
            </p>
          ))}
          {!trace.implementation.length ? <p>No linked PR evidence.</p> : null}
        </div>
        <div>
          <h3>QA verification</h3>
          {trace.verification.map((verification) => (
            <p key={verification.id}>
              {verification.category} · {verification.result} ·{" "}
              {formatDate(verification.recordedAt)}
              {verification.referenceUrl ? (
                <>
                  {" · "}
                  <a
                    href={verification.referenceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    evidence
                  </a>
                </>
              ) : null}
            </p>
          ))}
          {!trace.verification.length ? <p>No recorded QA evidence.</p> : null}
        </div>
        <div>
          <h3>Defects</h3>
          {trace.defects.map((defect) => (
            <p key={defect.id}>
              DEF-{defect.number} · {defect.title} · {defect.severity} ·{" "}
              {defect.status}
            </p>
          ))}
          {!trace.defects.length ? <p>No linked defects.</p> : null}
        </div>
        <div>
          <h3>Client acceptance history</h3>
          {trace.acceptance.map((target) => (
            <p key={`${target.id}:${target.action ?? "pending"}`}>
              {target.title} v{target.version} · {target.action ?? "pending"}
              {target.actedAt ? ` · ${formatDate(target.actedAt)}` : ""}
            </p>
          ))}
          {!trace.acceptance.length ? (
            <p>No published milestone acceptance.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatDate(value: DateValue) {
  return value ? new Date(value).toLocaleString() : "Unknown time";
}

const gapLabels: Record<string, string> = {
  incomplete_material_work: "Incomplete material work",
  missing_planned_work: "No planned work",
  missing_implementation: "No implementation evidence",
  open_implementation: "Implementation open or unmerged",
  failing_checks: "Provider checks failing",
  pending_checks: "Provider checks pending",
  unknown_checks: "Provider checks unknown",
  missing_verification: "Verification missing",
  pending_verification: "Verification pending",
  failed_verification: "Verification failed",
  blocked_verification: "Verification blocked",
  stale_verification: "Verification stale",
  unresolved_defect: "Unresolved linked defect",
  pending_acceptance: "Delivery acceptance pending",
};

function gapLabel(gap: string) {
  return gapLabels[gap] ?? gap.replaceAll("_", " ");
}
