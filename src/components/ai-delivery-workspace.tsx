"use client";

import { useEffect, useState, type FormEvent } from "react";

import { ProjectTabs } from "@/components/planning-workspace";

type JobKind =
  "scope_change_analysis" | "delivery_risk_brief" | "work_context_qa_pack";
type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
type Evidence = { type: string; label: string; recordId?: string };
type Job = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  requestId: string | null;
  milestoneId: string | null;
  workItemId: string | null;
  contextFingerprint: string;
  contextSnapshot: {
    targetLabel: string;
    facts: Array<{
      evidenceKey: string;
      type: string;
      label: string;
      content: unknown;
    }>;
    deterministicFacts?: unknown;
    truncated: boolean;
  };
  evidenceMap: Record<string, Evidence>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  provider: string;
  model: string;
  createdAt: string | Date;
  completedAt: string | Date | null;
  stale?: boolean;
  attempts?: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
    durationMs: number | null;
  }>;
};

type CitedItem = {
  title: string;
  detail: string;
  evidenceKeys: string[];
};

type CitedProse = {
  text: string;
  evidenceKeys: string[];
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const payload = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || payload.data === undefined) {
    throw new Error(
      payload.error?.message || "The action could not be completed.",
    );
  }
  return payload.data;
}

function labelForKind(kind: JobKind) {
  if (kind === "scope_change_analysis") return "Scope Change Analyst";
  if (kind === "delivery_risk_brief") return "Delivery Risk Brief";
  return "Work Context & QA Pack";
}

export function AiDeliveryWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  initialJobs,
  requests,
  milestones,
  workItems,
  initialTarget,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: { id: string; key: string; name: string; clientName: string };
  initialJobs: Job[];
  requests: Array<{ id: string; title: string; state: string }>;
  milestones: Array<{ id: string; name: string; status: string }>;
  workItems: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
  }>;
  initialTarget: {
    kind?: string;
    requestId?: string;
    milestoneId?: string;
    workItemId?: string;
  };
}>) {
  const allowedKinds: JobKind[] = [
    "scope_change_analysis",
    "delivery_risk_brief",
    "work_context_qa_pack",
  ];
  const [kind, setKind] = useState<JobKind>(
    allowedKinds.includes(initialTarget.kind as JobKind)
      ? (initialTarget.kind as JobKind)
      : "scope_change_analysis",
  );
  const [requestId, setRequestId] = useState(
    initialTarget.requestId || requests[0]?.id || "",
  );
  const [milestoneId, setMilestoneId] = useState(
    initialTarget.milestoneId || "",
  );
  const [workItemId, setWorkItemId] = useState(
    initialTarget.workItemId || workItems[0]?.id || "",
  );
  const [jobs, setJobs] = useState(initialJobs);
  const [selectedId, setSelectedId] = useState(initialJobs[0]?.id || "");
  const [selected, setSelected] = useState<Job | null>(initialJobs[0] || null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const base = `/api/v1/workspaces/${workspaceId}/projects/${project.id}/ai/jobs`;

  useEffect(() => {
    if (!selectedId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await request<Job>(`${base}/${selectedId}`);
        if (stopped) return;
        setSelected(next);
        setJobs((current) =>
          current.map((item) => (item.id === next.id ? next : item)),
        );
        if (next.status === "queued" || next.status === "running") {
          timer = setTimeout(load, 1_500);
        }
      } catch (error) {
        if (!stopped) setMessage((error as Error).message);
      }
    };
    void load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [base, selectedId]);

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target =
      kind === "scope_change_analysis"
        ? { kind, requestId }
        : kind === "delivery_risk_brief"
          ? { kind, ...(milestoneId ? { milestoneId } : {}) }
          : { kind, workItemId };
    setPending(true);
    setMessage("");
    try {
      const job = await request<Job>(base, {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), target }),
      });
      setJobs((current) => [
        job,
        ...current.filter((item) => item.id !== job.id),
      ]);
      setSelected(job);
      setSelectedId(job.id);
      setMessage(
        "AI job queued. The evidence snapshot is now fixed for this run.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function jobAction(action: "retry" | "cancel") {
    if (!selected) return;
    setPending(true);
    try {
      const job = await request<Job>(`${base}/${selected.id}/${action}`, {
        method: "POST",
      });
      setSelected(job);
      setJobs((current) =>
        current.map((item) => (item.id === job.id ? job : item)),
      );
      setMessage(
        action === "retry"
          ? "Retry queued with fresh context."
          : "Job canceled.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="delivery-stack ai-delivery-page">
      <header className="project-header ai-delivery-header">
        <div>
          <p className="eyebrow">{project.clientName}</p>
          <div className="delivery-row-title">
            <span className="project-key">{project.key}</span>
            <h1>AI delivery intelligence</h1>
          </div>
          <p>
            Evidence-grounded analysis with durable history and human-confirmed
            actions · {project.name}
          </p>
        </div>
        <ProjectTabs
          workspaceSlug={workspaceSlug}
          projectKey={project.key}
          current="ai"
        />
      </header>

      {message ? <output className="ai-message">{message}</output> : null}

      <div className="ai-workspace-grid">
        <aside className="ai-job-rail">
          <form onSubmit={createJob} className="ai-launcher">
            <div className="section-heading">
              <div>
                <p className="eyebrow">New analysis</p>
                <h2>Choose a bounded job</h2>
              </div>
            </div>
            <label>
              Job
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as JobKind)}
              >
                {allowedKinds.map((item) => (
                  <option key={item} value={item}>
                    {labelForKind(item)}
                  </option>
                ))}
              </select>
            </label>
            {kind === "scope_change_analysis" ? (
              <label>
                Commercial request
                <select
                  required
                  value={requestId}
                  onChange={(event) => setRequestId(event.target.value)}
                >
                  {requests.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {item.state.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {kind === "delivery_risk_brief" ? (
              <label>
                Delivery target
                <select
                  value={milestoneId}
                  onChange={(event) => setMilestoneId(event.target.value)}
                >
                  <option value="">Whole project</option>
                  {milestones.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {kind === "work_context_qa_pack" ? (
              <label>
                Work item
                <select
                  required
                  value={workItemId}
                  onChange={(event) => setWorkItemId(event.target.value)}
                >
                  {workItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.identifier} · {item.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              disabled={
                pending || (kind === "scope_change_analysis" && !requestId)
              }
            >
              {pending ? "Starting…" : "Run analysis"}
            </button>
            <p className="metadata">
              A fixed evidence snapshot is sent to the deployment’s configured
              provider. No automatic fallback is used.
            </p>
          </form>

          <section className="ai-history" aria-label="AI job history">
            <p className="eyebrow">History</p>
            {jobs.map((job) => (
              <button
                type="button"
                key={job.id}
                className={job.id === selectedId ? "is-selected" : undefined}
                onClick={() => setSelectedId(job.id)}
              >
                <span>{labelForKind(job.kind)}</span>
                <small>
                  {job.status} · {new Date(job.createdAt).toLocaleString()}
                </small>
              </button>
            ))}
            {!jobs.length ? <p>No AI jobs yet.</p> : null}
          </section>
        </aside>

        <main className="ai-result-pane">
          {selected ? (
            <JobResult
              job={selected}
              actionBase={`${base}/${selected.id}/actions`}
              clarificationBase={
                selected.requestId
                  ? `/api/v1/workspaces/${workspaceId}/projects/${project.id}/commercial/requests/${selected.requestId}/clarifications`
                  : undefined
              }
              onMessage={setMessage}
            />
          ) : (
            <section className="ai-empty-state">
              <p className="eyebrow">No result selected</p>
              <h2>Start with a specific delivery question.</h2>
              <p>
                Scope, risk, and QA jobs use different bounded contexts and
                structured result contracts.
              </p>
            </section>
          )}
          {selected?.status === "failed" || selected?.status === "canceled" ? (
            <button disabled={pending} onClick={() => jobAction("retry")}>
              Retry with current context
            </button>
          ) : null}
          {selected?.status === "queued" || selected?.status === "running" ? (
            <button
              className="secondary"
              disabled={pending}
              onClick={() => jobAction("cancel")}
            >
              Cancel job
            </button>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function JobResult({
  job,
  actionBase,
  clarificationBase,
  onMessage,
}: Readonly<{
  job: Job;
  actionBase: string;
  clarificationBase?: string;
  onMessage: (message: string) => void;
}>) {
  const [evidenceKey, setEvidenceKey] = useState("");
  const evidence = job.contextSnapshot.facts.find(
    (item) => item.evidenceKey === evidenceKey,
  );
  return (
    <>
      <section className="ai-result-header">
        <div>
          <p className="eyebrow">{labelForKind(job.kind)}</p>
          <h2>{job.contextSnapshot.targetLabel}</h2>
          <p>
            <span className={`ai-status ai-status-${job.status}`}>
              {job.status}
            </span>
            {" · "}
            {job.provider} / {job.model}
          </p>
        </div>
        <p className="metadata">
          {job.contextSnapshot.facts.length} evidence records
          {job.contextSnapshot.truncated ? " · bounded context truncated" : ""}
        </p>
      </section>
      {job.stale ? (
        <div className="ai-stale-banner">
          This result is stale because its source context has changed. Run a
          fresh analysis before acting.
        </div>
      ) : null}
      {job.status === "queued" || job.status === "running" ? (
        <div className="ai-running" role="status">
          <span />
          {job.status === "queued"
            ? "Waiting for a durable runner…"
            : "Analyzing fixed evidence…"}
        </div>
      ) : null}
      {job.status === "failed" ? (
        <div className="ai-error">
          <h3>Analysis could not be completed</h3>
          <p>{job.errorMessage}</p>
          <p className="metadata">
            No automatic retry or provider fallback occurred.
          </p>
        </div>
      ) : null}
      {job.status === "succeeded" && job.result ? (
        job.kind === "scope_change_analysis" ? (
          <ScopeResult
            job={job}
            actionBase={actionBase}
            clarificationBase={clarificationBase!}
            cite={setEvidenceKey}
            onMessage={onMessage}
          />
        ) : job.kind === "delivery_risk_brief" ? (
          <RiskResult
            result={job.result}
            cite={setEvidenceKey}
            facts={job.contextSnapshot.deterministicFacts}
          />
        ) : (
          <QaResult result={job.result} cite={setEvidenceKey} />
        )
      ) : null}
      {job.attempts?.length ? (
        <details className="ai-attempts">
          <summary>Attempt and usage metadata</summary>
          {job.attempts.map((attempt) => (
            <p key={attempt.id}>
              Attempt {attempt.attemptNumber} · {attempt.status} · input{" "}
              {attempt.inputTokens ?? "—"} · output{" "}
              {attempt.outputTokens ?? "—"} · cached{" "}
              {attempt.cachedInputTokens ?? "—"} · {attempt.durationMs ?? "—"}{" "}
              ms
            </p>
          ))}
        </details>
      ) : null}
      {evidence ? (
        <aside className="ai-evidence-inspector">
          <button
            type="button"
            className="text-button"
            onClick={() => setEvidenceKey("")}
          >
            Close evidence
          </button>
          <p className="eyebrow">{evidence.evidenceKey}</p>
          <h3>{evidence.label}</h3>
          <pre>{JSON.stringify(evidence.content, null, 2)}</pre>
        </aside>
      ) : null}
    </>
  );
}

function EvidenceKeys({
  keys,
  cite,
}: Readonly<{ keys: string[]; cite: (key: string) => void }>) {
  return (
    <span className="ai-citations">
      {keys.map((key) => (
        <button type="button" key={key} onClick={() => cite(key)}>
          {key}
        </button>
      ))}
    </span>
  );
}

function CitedList({
  title,
  items,
  cite,
}: Readonly<{
  title: string;
  items: CitedItem[];
  cite: (key: string) => void;
}>) {
  if (!items.length) return null;
  return (
    <section className="ai-result-section">
      <h3>{title}</h3>
      {items.map((item, index) => (
        <article key={`${item.title}:${index}`}>
          <h4>{item.title}</h4>
          <p>{item.detail}</p>
          <EvidenceKeys keys={item.evidenceKeys} cite={cite} />
        </article>
      ))}
    </section>
  );
}

function ScopeResult({
  job,
  actionBase,
  clarificationBase,
  cite,
  onMessage,
}: Readonly<{
  job: Job;
  actionBase: string;
  clarificationBase: string;
  cite: (key: string) => void;
  onMessage: (message: string) => void;
}>) {
  const result = job.result as {
    summary: CitedProse;
    findings: CitedItem[];
    uncertainties: CitedItem[];
    conflicts: CitedItem[];
    missingQuestions: string[];
    draftDecision: CitedProse;
    clientSafeWording: CitedProse;
    workCandidates: Array<{
      candidateKey: string;
      title: string;
      description: string;
      acceptanceCriteria: string | null;
      evidenceKeys: string[];
    }>;
    clarificationCandidates: Array<{
      candidateKey: string;
      question: string;
      evidenceKeys: string[];
    }>;
  };
  const [workKeys, setWorkKeys] = useState<string[]>([]);
  const [questionKeys, setQuestionKeys] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [actionKey, setActionKey] = useState(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const selection = {
    idempotencyKey: actionKey,
    contextFingerprint: job.contextFingerprint,
    workCandidateKeys: workKeys,
    clarificationCandidateKeys: questionKeys,
  };
  async function action(type: "preview" | "confirm") {
    setPending(true);
    try {
      const data = await request<Record<string, unknown>>(
        `${actionBase}/${type}`,
        {
          method: "POST",
          body: JSON.stringify(selection),
        },
      );
      if (type === "preview") {
        setPreview(data);
        onMessage(
          "Preview ready. Review every selected draft before confirming.",
        );
      } else {
        setPreview(null);
        setActionKey(crypto.randomUUID());
        onMessage(
          "Draft work and internal clarification questions created atomically.",
        );
      }
    } catch (error) {
      onMessage((error as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="ai-result-body">
      <div className="ai-summary">
        <p>{result.summary.text}</p>
        <EvidenceKeys keys={result.summary.evidenceKeys} cite={cite} />
      </div>
      <CitedList title="Findings" items={result.findings} cite={cite} />
      <CitedList title="Uncertainty" items={result.uncertainties} cite={cite} />
      <CitedList title="Conflicts" items={result.conflicts} cite={cite} />
      <section className="ai-draft-copy">
        <div>
          <p className="eyebrow">Internal draft</p>
          <h3>Decision wording</h3>
          <p>{result.draftDecision.text}</p>
          <EvidenceKeys keys={result.draftDecision.evidenceKeys} cite={cite} />
        </div>
        <div>
          <p className="eyebrow">Client-safe draft</p>
          <h3>Proposed wording</h3>
          <p>{result.clientSafeWording.text}</p>
          <EvidenceKeys
            keys={result.clientSafeWording.evidenceKeys}
            cite={cite}
          />
        </div>
      </section>
      <section className="ai-candidates">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Bounded actions</p>
            <h3>Select drafts to create</h3>
          </div>
          <span className="metadata">Human confirmation required</span>
        </div>
        {result.workCandidates.map((candidate) => (
          <label key={candidate.candidateKey}>
            <input
              type="checkbox"
              checked={workKeys.includes(candidate.candidateKey)}
              onChange={() =>
                setWorkKeys((current) =>
                  current.includes(candidate.candidateKey)
                    ? current.filter((key) => key !== candidate.candidateKey)
                    : [...current, candidate.candidateKey],
                )
              }
            />
            <span>
              <strong>{candidate.title}</strong>
              <small>{candidate.description}</small>
              <EvidenceKeys keys={candidate.evidenceKeys} cite={cite} />
            </span>
          </label>
        ))}
        {result.clarificationCandidates.map((candidate) => (
          <label key={candidate.candidateKey}>
            <input
              type="checkbox"
              checked={questionKeys.includes(candidate.candidateKey)}
              onChange={() =>
                setQuestionKeys((current) =>
                  current.includes(candidate.candidateKey)
                    ? current.filter((key) => key !== candidate.candidateKey)
                    : [...current, candidate.candidateKey],
                )
              }
            />
            <span>
              <strong>Clarification</strong>
              <small>{candidate.question}</small>
              <EvidenceKeys keys={candidate.evidenceKeys} cite={cite} />
            </span>
          </label>
        ))}
        <button
          type="button"
          disabled={
            pending || job.stale || workKeys.length + questionKeys.length === 0
          }
          onClick={() => action("preview")}
        >
          Preview selected drafts
        </button>
        {preview ? (
          <div className="ai-confirmation-preview">
            <p>
              Selected work will be backlog, unclassified, unassigned, and
              commercially unlinked. Clarifications remain internal drafts.
            </p>
            <p>
              No request, decision, client publication, or acceptance state
              changes.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => action("confirm")}
            >
              Confirm and create drafts
            </button>
          </div>
        ) : null}
      </section>
      <ClarificationDrafts base={clarificationBase} />
    </div>
  );
}

function RiskResult({
  result,
  facts,
  cite,
}: Readonly<{
  result: Record<string, unknown>;
  facts: unknown;
  cite: (key: string) => void;
}>) {
  return (
    <div className="ai-result-body">
      <section className="ai-deterministic-facts">
        <p className="eyebrow">Server-authored facts</p>
        <pre>{JSON.stringify(facts, null, 2)}</pre>
      </section>
      <CitedList
        title="AI interpretation"
        items={(result.interpretation || []) as CitedItem[]}
        cite={cite}
      />
      <CitedList
        title="Recommended actions"
        items={(result.recommendedActions || []) as CitedItem[]}
        cite={cite}
      />
      <CitedList
        title="Watch items"
        items={(result.watchItems || []) as CitedItem[]}
        cite={cite}
      />
    </div>
  );
}

function QaResult({
  result,
  cite,
}: Readonly<{ result: Record<string, unknown>; cite: (key: string) => void }>) {
  const contextSummary = result.contextSummary as CitedProse;
  const scenarios = (result.testScenarios || []) as Array<{
    title: string;
    preconditions: string[];
    steps: string[];
    expectedResult: string;
    evidenceKeys: string[];
  }>;
  return (
    <div className="ai-result-body">
      <div className="ai-summary">
        <p>{contextSummary.text}</p>
        <EvidenceKeys keys={contextSummary.evidenceKeys} cite={cite} />
      </div>
      <CitedList
        title="Contradictions"
        items={(result.contradictions || []) as CitedItem[]}
        cite={cite}
      />
      <CitedList
        title="Missing information"
        items={(result.missingInformation || []) as CitedItem[]}
        cite={cite}
      />
      <section className="ai-result-section">
        <h3>Draft test scenarios</h3>
        {scenarios.map((scenario) => (
          <article key={scenario.title}>
            <h4>{scenario.title}</h4>
            {scenario.preconditions.length ? (
              <p>Given: {scenario.preconditions.join("; ")}</p>
            ) : null}
            <ol>
              {scenario.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>
              <strong>Expected:</strong> {scenario.expectedResult}
            </p>
            <EvidenceKeys keys={scenario.evidenceKeys} cite={cite} />
          </article>
        ))}
      </section>
    </div>
  );
}

export function ClarificationDrafts({ base }: Readonly<{ base: string }>) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      question: string;
      status: "draft" | "resolved" | "dismissed";
    }>
  >([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void request<typeof items>(base)
      .then(setItems)
      .catch(() => undefined);
  }, [base]);
  async function update(id: string, status: "resolved" | "dismissed") {
    try {
      const item = await request<(typeof items)[number]>(`${base}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setItems((current) =>
        current.map((value) => (value.id === id ? item : value)),
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (!items.length) return null;
  return (
    <section className="ai-clarifications">
      <p className="eyebrow">Internal only</p>
      <h3>Clarification drafts</h3>
      {items.map((item) => (
        <article key={item.id}>
          <p>{item.question}</p>
          <span className="metadata">{item.status}</span>
          <div>
            <button
              type="button"
              className="text-button"
              onClick={() => navigator.clipboard.writeText(item.question)}
            >
              Copy
            </button>
            {item.status === "draft" ? (
              <>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => update(item.id, "resolved")}
                >
                  Resolve
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => update(item.id, "dismissed")}
                >
                  Dismiss
                </button>
              </>
            ) : null}
          </div>
        </article>
      ))}
      {message ? <output>{message}</output> : null}
    </section>
  );
}
