"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { apiRequest } from "@/components/delivery-workspace";
import { ClarificationDrafts } from "@/components/ai-delivery-workspace";

type Source = {
  id: string;
  name: string;
  parseState: "ready" | "needs_ocr" | "failed";
};

type ScopeItem = {
  id: string;
  title: string;
  kind: string;
  archivedAt: string | Date | null;
};

type Anchor = {
  id: string;
  sourceId: string;
  sourceName: string;
  startOffset: number;
  endOffset: number;
  label: string | null;
};

type Impact = {
  id: string;
  decisionId: string | null;
  confidence: "estimate" | "confirmed";
  effortMinutes: number | null;
  scheduleDeltaDays: number | null;
  targetDate: string | null;
  monetaryAmount: string | null;
  currencyCode: string | null;
  notes: string | null;
  createdAt: string | Date;
};

type Decision = {
  id: string;
  disposition:
    "covered" | "absorbed" | "swap" | "paid_change" | "deferred" | "rejected";
  coverageBasis: string | null;
  rationale: string | null;
  confirmedAt: string | Date;
  supersedesDecisionId: string | null;
  actorUserId: string;
  actorName: string;
  scopeItems: Array<ScopeItem & { role: "affected" | "swap_offset" }>;
  anchors: Anchor[];
};

type DecisionHistory = Pick<
  Decision,
  | "id"
  | "disposition"
  | "coverageBasis"
  | "rationale"
  | "confirmedAt"
  | "supersedesDecisionId"
  | "actorUserId"
  | "actorName"
> & { supersededAt: string | Date | null };

type CommercialRequest = {
  id: string;
  state: "open" | "needs_clarification" | "resolved" | "withdrawn";
  title: string;
  requestText: string;
  externalRequester: string | null;
  receivedAt: string | Date;
  currentDecision: Decision | null;
  decisionHistory: DecisionHistory[];
  affectedScopeItems: ScopeItem[];
  anchors: Anchor[];
  impacts: Impact[];
  linkedWorkItems: Array<{
    id: string;
    number: number;
    title: string;
    status: string;
  }>;
  contradictionCount: number;
};

type Ledger = {
  data: CommercialRequest[];
  page: { number: number; size: number; total: number; pages: number };
};

export function CommercialChangeControl({
  workspaceId,
  workspaceSlug,
  projectId,
  projectKey,
  sources,
  scopeItems,
  ledger,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  projectKey: string;
  sources: Source[];
  scopeItems: ScopeItem[];
  ledger: Ledger;
}>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const base = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/commercial/requests`;
  const readySources = sources.filter(
    (source) => source.parseState === "ready",
  );
  const activeScope = scopeItems.filter((item) => !item.archivedAt);
  const openRequests = ledger.data.filter(
    (request) => request.state === "open",
  );
  const clarificationRequests = ledger.data.filter(
    (request) => request.state === "needs_clarification",
  );
  const decided = ledger.data.filter(
    (request) => request.state === "resolved" || request.state === "withdrawn",
  );

  function refresh(text: string) {
    setMessage(text);
    startTransition(() => router.refresh());
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const receivedValue = String(form.get("receivedAt") || "");
    const impact = impactPayload(form, "request");
    const response = await apiRequest(base, "POST", {
      idempotencyKey: crypto.randomUUID(),
      title: form.get("title"),
      requestText: form.get("requestText"),
      externalRequester: form.get("externalRequester"),
      receivedAt: receivedValue
        ? new Date(receivedValue).toISOString()
        : new Date().toISOString(),
      scopeItemIds: form.getAll("scopeItemIds"),
      anchors: anchorPayload(form, "request"),
      impact,
    });
    if (response.ok) {
      formElement.reset();
      refresh("Client request recorded.");
    } else setMessage(response.message);
  }

  async function updateState(requestId: string, state: string) {
    const response = await apiRequest(`${base}/${requestId}`, "PATCH", {
      state,
    });
    if (response.ok) refresh("Request state updated.");
    else setMessage(response.message);
  }

  async function confirmDecision(
    event: FormEvent<HTMLFormElement>,
    request: CommercialRequest,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const disposition = String(form.get("disposition"));
    const response = await apiRequest(
      `${base}/${request.id}/decisions`,
      "POST",
      {
        idempotencyKey: crypto.randomUUID(),
        disposition,
        coverageBasis:
          disposition === "covered" ? form.get("coverageBasis") || null : null,
        rationale: form.get("rationale"),
        supersedesDecisionId: request.currentDecision?.id ?? null,
        affectedScopeItemIds: form.getAll("affectedScopeItemIds"),
        swapOffsetScopeItemIds:
          disposition === "swap" ? form.getAll("swapOffsetScopeItemIds") : [],
        anchors: anchorPayload(form, "decision"),
        impact: impactPayload(form, "decision"),
      },
    );
    if (response.ok) {
      formElement.reset();
      refresh(
        request.currentDecision
          ? "Commercial decision superseded. Linked active work may require review."
          : "Commercial decision confirmed.",
      );
    } else setMessage(response.message);
  }

  async function recordImpact(
    event: FormEvent<HTMLFormElement>,
    request: CommercialRequest,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const impact = impactPayload(form, "followup");
    if (!impact) return setMessage("Record at least one impact value.");
    const response = await apiRequest(`${base}/${request.id}/impacts`, "POST", {
      ...impact,
      decisionId: request.currentDecision?.id ?? null,
      supersedesImpactAssessmentId: request.impacts[0]?.id ?? null,
    });
    if (response.ok) {
      formElement.reset();
      refresh("Impact assessment recorded without rewriting prior history.");
    } else setMessage(response.message);
  }

  return (
    <section
      className="commercial-change-control"
      aria-labelledby="change-control-title"
    >
      <header className="section-heading">
        <div>
          <p className="eyebrow">Change control</p>
          <h2 id="change-control-title">Client requests and decisions</h2>
          <p className="metadata">
            Capture the commercial question separately from the decision that
            does—or does not—authorize delivery work.
          </p>
        </div>
        <span className="commercial-badge commercial-linked">
          {ledger.page.total} requests
        </span>
      </header>

      {message ? (
        <output className="form-status" role="status" aria-live="polite">
          {message}
        </output>
      ) : null}

      <details className="commercial-request-composer">
        <summary>Record a client request</summary>
        <form onSubmit={createRequest} className="commercial-change-form">
          <label>
            Request title
            <input name="title" required maxLength={240} />
          </label>
          <label className="field-wide">
            Original language or concise description
            <textarea name="requestText" required maxLength={10_000} rows={4} />
          </label>
          <label>
            Client/requester label (optional)
            <input name="externalRequester" maxLength={160} />
          </label>
          <label>
            Received at
            <input name="receivedAt" type="datetime-local" />
          </label>
          <ScopeSelection
            name="scopeItemIds"
            label="Potentially affected baseline scope"
            scopeItems={activeScope}
          />
          <EvidenceFields prefix="request" sources={readySources} />
          <ImpactFields prefix="request" />
          <button type="submit" disabled={pending}>
            Record request
          </button>
        </form>
      </details>

      <RequestGroup
        title="Open requests"
        requests={openRequests}
        empty="No open client requests."
        {...{
          pending,
          sources: readySources,
          scopeItems: activeScope,
          workspaceId,
          projectId,
          workspaceSlug,
          projectKey,
          updateState,
          confirmDecision,
          recordImpact,
        }}
      />
      <RequestGroup
        title="Needs clarification"
        requests={clarificationRequests}
        empty="No requests are waiting for clarification."
        {...{
          pending,
          sources: readySources,
          scopeItems: activeScope,
          workspaceId,
          projectId,
          workspaceSlug,
          projectKey,
          updateState,
          confirmDecision,
          recordImpact,
        }}
      />
      <RequestGroup
        title="Decision ledger"
        requests={decided}
        empty="No confirmed or withdrawn requests yet."
        {...{
          pending,
          sources: readySources,
          scopeItems: activeScope,
          workspaceId,
          projectId,
          workspaceSlug,
          projectKey,
          updateState,
          confirmDecision,
          recordImpact,
        }}
      />

      {ledger.page.pages > 1 ? (
        <nav className="pagination" aria-label="Commercial request pages">
          {ledger.page.number > 1 ? (
            <Link href={`?requestPage=${ledger.page.number - 1}`}>
              Previous requests
            </Link>
          ) : null}
          <span>
            Request page {ledger.page.number} of {ledger.page.pages}
          </span>
          {ledger.page.number < ledger.page.pages ? (
            <Link href={`?requestPage=${ledger.page.number + 1}`}>
              Next requests
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}

type RequestGroupProps = {
  title: string;
  requests: CommercialRequest[];
  empty: string;
  pending: boolean;
  sources: Source[];
  scopeItems: ScopeItem[];
  workspaceId: string;
  projectId: string;
  workspaceSlug: string;
  projectKey: string;
  updateState: (requestId: string, state: string) => Promise<void>;
  confirmDecision: (
    event: FormEvent<HTMLFormElement>,
    request: CommercialRequest,
  ) => Promise<void>;
  recordImpact: (
    event: FormEvent<HTMLFormElement>,
    request: CommercialRequest,
  ) => Promise<void>;
};

function RequestGroup({
  title,
  requests,
  empty,
  ...actions
}: RequestGroupProps) {
  return (
    <section className="commercial-request-group">
      <h3>{title}</h3>
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} {...actions} />
      ))}
      {!requests.length ? <p className="empty-copy">{empty}</p> : null}
    </section>
  );
}

function RequestCard({
  request,
  pending,
  sources,
  scopeItems,
  workspaceId,
  projectId,
  workspaceSlug,
  projectKey,
  updateState,
  confirmDecision,
  recordImpact,
}: Omit<RequestGroupProps, "title" | "requests" | "empty"> & {
  request: CommercialRequest;
}) {
  return (
    <article className="commercial-request-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{request.state.replaceAll("_", " ")}</p>
          <h4>{request.title}</h4>
          <p>{request.requestText}</p>
        </div>
        <div className="commercial-request-ai-actions">
          {request.contradictionCount ? (
            <span className="commercial-badge commercial-commercially-unlinked">
              {request.contradictionCount} work contradiction
            </span>
          ) : null}
          <Link
            className="button-link secondary"
            href={`/app/${workspaceSlug}/projects/${projectKey}/ai?kind=scope_change_analysis&requestId=${request.id}`}
          >
            Analyze scope change
          </Link>
        </div>
      </div>
      <p className="metadata">
        Received {new Date(request.receivedAt).toLocaleString()}
        {request.externalRequester ? ` · ${request.externalRequester}` : ""}
      </p>
      <EvidenceList
        anchors={request.anchors}
        workspaceId={workspaceId}
        projectId={projectId}
      />
      <ClarificationDrafts
        base={`/api/v1/workspaces/${workspaceId}/projects/${projectId}/commercial/requests/${request.id}/clarifications`}
      />
      {request.affectedScopeItems.length ? (
        <p className="metadata">
          Affected scope:{" "}
          {request.affectedScopeItems.map((item) => item.title).join(", ")}
        </p>
      ) : null}

      <DecisionLedger
        request={request}
        workspaceId={workspaceId}
        projectId={projectId}
      />
      <RequestLinkedWork
        request={request}
        workspaceSlug={workspaceSlug}
        projectKey={projectKey}
      />
      <RequestImpactHistory impacts={request.impacts} />
      <RequestStateActions
        request={request}
        pending={pending}
        updateState={updateState}
      />
      <RequestDecisionEditor
        request={request}
        pending={pending}
        sources={sources}
        scopeItems={scopeItems}
        confirmDecision={confirmDecision}
      />
      <RequestImpactEditor
        request={request}
        pending={pending}
        recordImpact={recordImpact}
      />
    </article>
  );
}

function DecisionLedger({
  request,
  workspaceId,
  projectId,
}: Readonly<{
  request: CommercialRequest;
  workspaceId: string;
  projectId: string;
}>) {
  const priorDecisions = request.decisionHistory.filter(
    (decision) => decision.id !== request.currentDecision?.id,
  );
  return (
    <>
      {request.currentDecision ? (
        <div className="commercial-decision-summary">
          <strong>
            {request.currentDecision.disposition.replaceAll("_", " ")}
          </strong>
          <span>
            Confirmed{" "}
            {new Date(request.currentDecision.confirmedAt).toLocaleString()}
            {` · ${request.currentDecision.actorName}`}
            {request.currentDecision.coverageBasis
              ? ` · ${request.currentDecision.coverageBasis.replaceAll("_", " ")}`
              : ""}
          </span>
          {request.currentDecision.rationale ? (
            <p>{request.currentDecision.rationale}</p>
          ) : null}
          <EvidenceList
            anchors={request.currentDecision.anchors}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        </div>
      ) : null}
      {priorDecisions.length ? (
        <details className="commercial-decision-history">
          <summary>Prior decisions ({priorDecisions.length})</summary>
          {priorDecisions.map((decision) => (
            <div key={decision.id}>
              <strong>{decision.disposition.replaceAll("_", " ")}</strong>
              <span>
                Confirmed {new Date(decision.confirmedAt).toLocaleString()} ·{" "}
                {decision.actorName}
                {decision.supersededAt
                  ? ` · superseded ${new Date(decision.supersededAt).toLocaleString()}`
                  : ""}
              </span>
              {decision.rationale ? <p>{decision.rationale}</p> : null}
            </div>
          ))}
        </details>
      ) : null}
    </>
  );
}

function RequestLinkedWork({
  request,
  workspaceSlug,
  projectKey,
}: Readonly<{
  request: CommercialRequest;
  workspaceSlug: string;
  projectKey: string;
}>) {
  if (!request.linkedWorkItems.length) return null;
  return (
    <div className="commercial-linked-work">
      <strong>Affected active work</strong>
      {request.linkedWorkItems.map((work) => (
        <Link
          key={work.id}
          href={`/app/${workspaceSlug}/projects/${projectKey}/work/${work.id}`}
        >
          {projectKey}-{work.number} · {work.title} (
          {work.status.replaceAll("_", " ")})
        </Link>
      ))}
    </div>
  );
}

function RequestImpactHistory({ impacts }: Readonly<{ impacts: Impact[] }>) {
  if (!impacts.length) return null;
  return (
    <div className="commercial-impact-list">
      <strong>Impact history</strong>
      {impacts.map((impact) => (
        <span key={impact.id}>{formatImpact(impact)}</span>
      ))}
    </div>
  );
}

function RequestStateActions({
  request,
  pending,
  updateState,
}: Readonly<{
  request: CommercialRequest;
  pending: boolean;
  updateState: RequestGroupProps["updateState"];
}>) {
  return (
    <div className="commercial-request-actions">
      {!request.currentDecision && request.state !== "withdrawn" ? (
        <>
          <button
            type="button"
            disabled={pending || request.state === "open"}
            onClick={() => updateState(request.id, "open")}
          >
            Mark open
          </button>
          <button
            type="button"
            disabled={pending || request.state === "needs_clarification"}
            onClick={() => updateState(request.id, "needs_clarification")}
          >
            Needs clarification
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => updateState(request.id, "withdrawn")}
          >
            Withdraw
          </button>
        </>
      ) : null}
      {request.state === "withdrawn" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => updateState(request.id, "open")}
        >
          Reopen request
        </button>
      ) : null}
    </div>
  );
}

function RequestDecisionEditor({
  request,
  pending,
  sources,
  scopeItems,
  confirmDecision,
}: Readonly<{
  request: CommercialRequest;
  pending: boolean;
  sources: Source[];
  scopeItems: ScopeItem[];
  confirmDecision: RequestGroupProps["confirmDecision"];
}>) {
  if (request.state === "withdrawn") return null;
  const buttonLabel = request.currentDecision
    ? "Supersede decision"
    : "Confirm decision";
  return (
    <details>
      <summary>
        {request.currentDecision
          ? "Correct/supersede decision"
          : "Confirm decision"}
      </summary>
      <form
        key={request.currentDecision?.id ?? "new-decision"}
        className="commercial-change-form"
        onSubmit={(event) => confirmDecision(event, request)}
      >
        <label>
          Disposition
          <select
            name="disposition"
            defaultValue={request.currentDecision?.disposition ?? "covered"}
          >
            <option value="covered">Covered</option>
            <option value="absorbed">Absorbed</option>
            <option value="swap">Scope swap</option>
            <option value="paid_change">Paid change</option>
            <option value="deferred">Deferred</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          Covered basis (only for covered)
          <select name="coverageBasis" defaultValue="">
            <option value="">Not specified</option>
            <option value="baseline">Baseline</option>
            <option value="defect_or_warranty">Defect or warranty</option>
            <option value="revision_allowance">Revision allowance</option>
            <option value="other_existing_obligation">Other obligation</option>
          </select>
        </label>
        <label className="field-wide">
          Decision rationale
          <textarea name="rationale" maxLength={10_000} rows={3} />
        </label>
        <ScopeSelection
          name="affectedScopeItemIds"
          label="Affected baseline scope"
          scopeItems={scopeItems}
        />
        <ScopeSelection
          name="swapOffsetScopeItemIds"
          label="Scope reduced/removed by a swap"
          scopeItems={scopeItems}
        />
        <EvidenceFields prefix="decision" sources={sources} />
        <ImpactFields prefix="decision" />
        <button type="submit" disabled={pending}>
          {buttonLabel}
        </button>
      </form>
    </details>
  );
}

function RequestImpactEditor({
  request,
  pending,
  recordImpact,
}: Readonly<{
  request: CommercialRequest;
  pending: boolean;
  recordImpact: RequestGroupProps["recordImpact"];
}>) {
  return (
    <details>
      <summary>Record a later impact assessment</summary>
      <form
        className="commercial-change-form"
        onSubmit={(event) => recordImpact(event, request)}
      >
        <ImpactFields prefix="followup" />
        <button type="submit" disabled={pending}>
          Record impact
        </button>
      </form>
    </details>
  );
}

function ScopeSelection({
  name,
  label,
  scopeItems,
}: {
  name: string;
  label: string;
  scopeItems: ScopeItem[];
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="commercial-check-grid">
        {scopeItems.map((item) => (
          <label key={`${name}:${item.id}`}>
            <input type="checkbox" name={name} value={item.id} />
            {item.kind} · {item.title}
          </label>
        ))}
        {!scopeItems.length ? <span>No active scope items.</span> : null}
      </div>
    </fieldset>
  );
}

function EvidenceFields({
  prefix,
  sources,
}: {
  prefix: string;
  sources: Source[];
}) {
  return (
    <fieldset>
      <legend>Supporting evidence (optional)</legend>
      <label>
        Source
        <select name={`${prefix}SourceId`} defaultValue="">
          <option value="">No evidence anchor</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start offset
        <input name={`${prefix}StartOffset`} type="number" min={0} />
      </label>
      <label>
        End offset
        <input name={`${prefix}EndOffset`} type="number" min={1} />
      </label>
      <label>
        Evidence label
        <input name={`${prefix}AnchorLabel`} maxLength={120} />
      </label>
    </fieldset>
  );
}

function ImpactFields({ prefix }: { prefix: string }) {
  return (
    <fieldset>
      <legend>Impact assessment (optional)</legend>
      <label>
        Confidence
        <select name={`${prefix}Confidence`} defaultValue="estimate">
          <option value="estimate">Estimate</option>
          <option value="confirmed">Confirmed fact/commitment</option>
        </select>
      </label>
      <label>
        Effort hours
        <input
          name={`${prefix}EffortHours`}
          type="number"
          min={0}
          step="0.25"
        />
      </label>
      <label>
        Schedule delta days
        <input
          name={`${prefix}ScheduleDeltaDays`}
          type="number"
          min={-3650}
          max={3650}
        />
      </label>
      <label>
        Relevant target date
        <input name={`${prefix}TargetDate`} type="date" />
      </label>
      <label>
        Exact amount
        <input
          name={`${prefix}Amount`}
          inputMode="decimal"
          placeholder="1250.00"
        />
      </label>
      <label>
        Currency
        <input name={`${prefix}Currency`} maxLength={3} placeholder="USD" />
      </label>
      <label className="field-wide">
        Impact notes
        <textarea name={`${prefix}ImpactNotes`} maxLength={5000} rows={2} />
      </label>
    </fieldset>
  );
}

function anchorPayload(form: FormData, prefix: string) {
  const sourceId = String(form.get(`${prefix}SourceId`) || "");
  if (!sourceId) return [];
  return [
    {
      sourceId,
      startOffset: Number(form.get(`${prefix}StartOffset`)),
      endOffset: Number(form.get(`${prefix}EndOffset`)),
      label: form.get(`${prefix}AnchorLabel`) || null,
    },
  ];
}

function impactPayload(form: FormData, prefix: string) {
  const effortHours = numericValue(form.get(`${prefix}EffortHours`));
  const scheduleDeltaDays = numericValue(
    form.get(`${prefix}ScheduleDeltaDays`),
  );
  const targetDate = String(form.get(`${prefix}TargetDate`) || "") || null;
  const monetaryAmount = String(form.get(`${prefix}Amount`) || "") || null;
  const currencyCode = String(form.get(`${prefix}Currency`) || "") || null;
  if (
    effortHours == null &&
    scheduleDeltaDays == null &&
    targetDate == null &&
    monetaryAmount == null
  )
    return null;
  return {
    idempotencyKey: crypto.randomUUID(),
    confidence: form.get(`${prefix}Confidence`) || "estimate",
    effortMinutes: effortHours == null ? null : Math.round(effortHours * 60),
    scheduleDeltaDays,
    targetDate,
    monetaryAmount,
    currencyCode,
    notes: form.get(`${prefix}ImpactNotes`) || null,
    anchors: [],
  };
}

function numericValue(value: FormDataEntryValue | null) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function EvidenceList({
  anchors,
  workspaceId,
  projectId,
}: {
  anchors: Anchor[];
  workspaceId: string;
  projectId: string;
}) {
  if (!anchors.length) return null;
  return (
    <div className="commercial-evidence-links">
      {anchors.map((anchor) => (
        <a
          key={anchor.id}
          href={`/api/v1/workspaces/${workspaceId}/projects/${projectId}/commercial/sources/${anchor.sourceId}/download`}
          title="Open the immutable evidence source"
        >
          {anchor.sourceName} · chars {anchor.startOffset}–{anchor.endOffset}
          {anchor.label ? ` · ${anchor.label}` : ""}
        </a>
      ))}
    </div>
  );
}

function formatImpact(impact: Impact) {
  const values = [
    impact.effortMinutes != null
      ? `${(impact.effortMinutes / 60).toFixed(2)}h`
      : null,
    impact.scheduleDeltaDays != null
      ? `${impact.scheduleDeltaDays >= 0 ? "+" : ""}${impact.scheduleDeltaDays} days`
      : null,
    impact.targetDate ? `target ${impact.targetDate}` : null,
    impact.monetaryAmount && impact.currencyCode
      ? `${impact.currencyCode} ${impact.monetaryAmount}`
      : null,
  ].filter(Boolean);
  return `${impact.confidence}: ${values.join(" · ")}`;
}
