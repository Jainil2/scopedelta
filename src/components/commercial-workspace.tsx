"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { apiRequest, type Project } from "@/components/delivery-workspace";
import {
  AppButton,
  AppField,
  AppFormActions,
  AppInput,
  AppSelect,
  AppTextarea,
} from "@/components/app-form-controls";
import { ProjectTabs } from "@/components/planning-workspace";

type Source = {
  id: string;
  kind: "pasted_text" | "pdf" | "docx";
  name: string;
  mediaType: string;
  byteSize: number;
  contentSha256: string;
  parseState: "ready" | "needs_ocr" | "failed";
  parseErrorCode: string | null;
  createdAt: string | Date;
};

type SourceDetail = Source & { extractedText: string | null };

type ScopeItem = {
  id: string;
  baselineVersionId: string;
  lineageKind: "carried_forward" | "revised" | "added" | "retired" | null;
  archivedAt: string | Date | null;
  revisionId: string;
  revisionNumber: number;
  kind: "deliverable" | "requirement" | "exclusion" | "constraint";
  title: string;
  details: string | null;
  anchors: Array<{
    id: string;
    sourceId: string;
    startOffset: number;
    endOffset: number;
    label: string | null;
  }>;
};

type Overview = {
  sources: Source[];
  baseline: {
    id: string;
    versionId: string;
    previousVersionId: string | null;
    versionNumber: number | null;
    label: string;
    state: "draft" | "effective" | "superseded";
    sourceId: string;
    effectiveAt: string | Date | null;
    supersededAt: string | Date | null;
    createdAt: string | Date;
    versions: Array<{
      id: string;
      versionId: string;
      previousVersionId: string | null;
      versionNumber: number | null;
      label: string;
      state: "draft" | "effective" | "superseded";
      sourceId: string;
      effectiveAt: string | Date | null;
      supersededAt: string | Date | null;
      createdAt: string | Date;
    }>;
  } | null;
  scopeItems: ScopeItem[];
};

type DriftItem = {
  id: string;
  number: number;
  title: string;
  status: string;
  purpose: string;
  basisCount: number;
  staleBasisCount: number;
  state:
    | "commercially_unlinked"
    | "needs_classification"
    | "linked"
    | "stale_basis"
    | "support_internal";
};

type DriftPage = {
  data: DriftItem[];
  page: { number: number; size: number; total: number; pages: number };
};

type DriftSummary = {
  commerciallyUnlinked: number;
  needsClassification: number;
  linked: number;
  staleBasis: number;
  supportInternal: number;
};

type CommercialHistory = {
  data: Array<{
    id: string;
    versionNumber: number | null;
    label: string;
    state: "draft" | "effective" | "superseded";
    sourceName: string;
    recordedAt: string | Date;
    effectiveAt: string | Date | null;
    supersededAt: string | Date | null;
    createdByName: string;
    scopeItems: number;
    sources: Array<{ id: string; name: string }>;
    items: Array<{
      id: string;
      scopeKind: string;
      title: string;
      archivedAt: string | Date | null;
      lineageKind: "carried_forward" | "revised" | "added" | "retired" | null;
      workLinks: number;
    }>;
    lineage: Partial<
      Record<"carried_forward" | "revised" | "added" | "retired", number>
    >;
    changes: Array<{
      currentScopeItemId: string;
      previousScopeItemId: string | null;
      kind: "carried_forward" | "revised" | "added" | "retired";
      scopeKind: string;
      title: string;
    }>;
    decisions: Array<{
      decisionId: string;
      disposition: string;
      requestTitle: string;
      confirmedAt: string | Date;
    }>;
  }>;
  page: { number: number; size: number; total: number; pages: number };
};

type DecisionOption = {
  id: string;
  requestTitle: string;
  disposition: string;
};

export function CommercialWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  initialOverview,
  drift,
  driftSummary,
  history,
  decisionOptions,
  changeControl,
  exposurePanel,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: Project;
  initialOverview: Overview;
  drift: DriftPage;
  driftSummary: DriftSummary;
  history: CommercialHistory;
  decisionOptions: DecisionOption[];
  changeControl?: ReactNode;
  exposurePanel?: ReactNode;
}>) {
  const router = useRouter();
  const overview = initialOverview;
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [editing, setEditing] = useState<ScopeItem | null>(null);
  const sourceTextRef = useRef<HTMLTextAreaElement>(null);
  const base = `/api/v1/workspaces/${workspaceId}/projects/${project.id}/commercial`;

  useEffect(() => {
    if (overview.baseline && source?.id !== overview.baseline.sourceId)
      void loadSource(overview.baseline.sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.baseline?.sourceId, source?.id]);

  function refresh(text: string) {
    setMessage(text);
    startTransition(() => router.refresh());
  }

  async function loadSource(
    sourceId: string,
    nextSelection?: { start: number; end: number },
  ) {
    setLoadingSource(true);
    setMessage("");
    try {
      const response = await fetch(`${base}/sources/${sourceId}`);
      const payload = (await response.json()) as {
        data?: SourceDetail;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data)
        throw new Error(
          payload.error?.message || "Unable to load source evidence.",
        );
      setSource(payload.data);
      const range = nextSelection ?? { start: 0, end: 0 };
      setSelection(range);
      requestAnimationFrame(() => {
        sourceTextRef.current?.focus();
        sourceTextRef.current?.setSelectionRange(range.start, range.end);
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load source evidence.",
      );
    } finally {
      setLoadingSource(false);
    }
  }

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const mode = String(data.get("sourceMode"));
    let bytes: Uint8Array;
    let kind: Source["kind"];
    let name: string;
    let mediaType: string;
    if (mode === "paste") {
      const text = String(data.get("pastedText") || "");
      bytes = new TextEncoder().encode(text);
      kind = "pasted_text";
      name = String(data.get("pasteName") || "Pasted commercial source");
      mediaType = "text/plain";
    } else {
      const file = data.get("sourceFile");
      if (!(file instanceof File) || !file.size) {
        setMessage("Choose a PDF or DOCX file.");
        return;
      }
      bytes = new Uint8Array(await file.arrayBuffer());
      name = file.name;
      mediaType = file.type;
      kind = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
    }
    const response = await apiRequest(`${base}/sources`, "POST", {
      idempotencyKey: crypto.randomUUID(),
      kind,
      name,
      mediaType,
      contentBase64: bytesToBase64(bytes),
    });
    if (response.ok) {
      form.reset();
      refresh("Commercial source preserved and parsed.");
    } else setMessage(response.message);
  }

  async function createBaseline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await apiRequest(`${base}/baseline`, "POST", {
      sourceId: formData.get("sourceId"),
    });
    if (response.ok) refresh("Initial commercial baseline created.");
    else setMessage(response.message);
  }

  async function createAmendment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await apiRequest(`${base}/baseline/versions`, "POST", {
      sourceId: formData.get("sourceId"),
      label: formData.get("label"),
      decisionIds: formData.getAll("decisionIds"),
    });
    if (response.ok)
      refresh("Amendment draft prepared from the current baseline.");
    else setMessage(response.message);
  }

  async function activateVersion() {
    if (!overview.baseline) return;
    const response = await apiRequest(
      `${base}/baseline/versions/${overview.baseline.versionId}/activate`,
      "POST",
      {},
    );
    if (response.ok) refresh("Baseline version is now effective.");
    else setMessage(response.message);
  }

  async function saveScope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (!overview.baseline || !source || selection.end <= selection.start) {
      setMessage("Select supporting text in the evidence inspector first.");
      return;
    }
    const content = {
      kind: formData.get("kind"),
      title: formData.get("title"),
      details: formData.get("details"),
      anchors: [
        {
          sourceId: source.id,
          startOffset: selection.start,
          endOffset: selection.end,
          label: formData.get("anchorLabel"),
        },
      ],
    };
    const response = editing
      ? await apiRequest(`${base}/scope-items/${editing.id}`, "PATCH", {
          ...content,
          idempotencyKey: crypto.randomUUID(),
        })
      : await apiRequest(`${base}/scope-items`, "POST", {
          ...content,
          idempotencyKey: crypto.randomUUID(),
          revisionIdempotencyKey: crypto.randomUUID(),
          baselineVersionId: overview.baseline.versionId,
        });
    if (response.ok) {
      setEditing(null);
      refresh(
        editing
          ? "Scope revision preserved."
          : "Scope item added to the baseline.",
      );
    } else setMessage(response.message);
  }

  async function archiveScope(item: ScopeItem) {
    const response = await apiRequest(
      `${base}/scope-items/${item.id}/archive`,
      "POST",
      { archived: !item.archivedAt },
    );
    if (response.ok)
      refresh(
        item.archivedAt ? "Scope item restored." : "Scope item archived.",
      );
    else setMessage(response.message);
  }

  function inspectAnchor(item: ScopeItem) {
    const anchor = item.anchors[0];
    if (anchor)
      void loadSource(anchor.sourceId, {
        start: anchor.startOffset,
        end: anchor.endOffset,
      });
  }

  const readySources = overview.sources.filter(
    (candidate) => candidate.parseState === "ready",
  );
  const selectedExcerpt =
    source?.extractedText?.slice(selection.start, selection.end) || "";

  return (
    <main className="commercial-page">
      <header className="project-header commercial-header">
        <div>
          <p className="eyebrow">{project.clientName}</p>
          <div className="delivery-row-title">
            <span className="project-key">{project.key}</span>
            <h1>Commercial</h1>
          </div>
          <p>
            Baseline evidence, delivery provenance and advisory drift ·{" "}
            {project.name}
          </p>
        </div>
        <ProjectTabs
          workspaceSlug={workspaceSlug}
          projectKey={project.key}
          current="commercial"
        />
      </header>

      <section
        className="commercial-status-strip"
        aria-label="Commercial drift summary"
      >
        <div className="status-critical">
          <strong>{driftSummary.commerciallyUnlinked}</strong>
          <span>Commercially unlinked</span>
        </div>
        <div>
          <strong>{driftSummary.needsClassification}</strong>
          <span>Needs classification</span>
        </div>
        <div>
          <strong>{driftSummary.linked}</strong>
          <span>Baseline linked</span>
        </div>
        <div>
          <strong>{driftSummary.staleBasis}</strong>
          <span>Stale basis</span>
        </div>
        <div>
          <strong>{driftSummary.supportInternal}</strong>
          <span>Support / internal</span>
        </div>
      </section>

      {message ? (
        <p className="commercial-message" role="status">
          {message}
        </p>
      ) : null}

      <div className="commercial-drift-priority">
        <DriftLedger
          drift={drift}
          workspaceSlug={workspaceSlug}
          projectKey={project.key}
        />
      </div>

      <div className="commercial-workspace-grid">
        <div className="commercial-ledger">
          <section className="commercial-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Private evidence</p>
                <h2>Commercial sources</h2>
              </div>
              <span className="metadata">
                5 MB per source · paste, text-PDF or DOCX
              </span>
            </div>
            <details className="commercial-disclosure">
              <summary>Add commercial source</summary>
              <form className="commercial-source-form" onSubmit={createSource}>
                <fieldset>
                  <legend>Source type</legend>
                  <label>
                    <input
                      type="radio"
                      name="sourceMode"
                      value="paste"
                      defaultChecked
                    />{" "}
                    Paste text
                  </label>
                  <label>
                    <input type="radio" name="sourceMode" value="file" /> Upload
                    file
                  </label>
                </fieldset>
                <AppField id="commercial-source-name" label="Source name">
                  <AppInput
                    name="pasteName"
                    maxLength={160}
                    defaultValue="Pasted commercial source"
                  />
                </AppField>
                <AppField
                  id="commercial-source-text"
                  label="Commercial text"
                  hint="Preserved as private evidence and never returned in drift summaries."
                >
                  <AppTextarea
                    name="pastedText"
                    rows={8}
                    maxLength={500000}
                    placeholder="Paste the agreed SOW, proposal or contract extract"
                  />
                </AppField>
                <AppField id="commercial-source-file" label="PDF or DOCX">
                  <AppInput
                    name="sourceFile"
                    type="file"
                    accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                  />
                </AppField>
                <AppFormActions>
                  <AppButton disabled={pending} aria-busy={pending}>
                    {pending ? "Preserving…" : "Preserve source"}
                  </AppButton>
                </AppFormActions>
              </form>
            </details>
            <div className="commercial-source-list">
              {overview.sources.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {sourceKindLabel(item.kind)} ·{" "}
                      {formatBytes(item.byteSize)}
                    </span>
                  </div>
                  <span className={`parse-state parse-${item.parseState}`}>
                    {parseStateLabel(item)}
                  </span>
                  <div className="commercial-row-actions">
                    <button
                      className="text-button"
                      onClick={() => loadSource(item.id)}
                      disabled={loadingSource}
                    >
                      Inspect
                    </button>
                    <a href={`${base}/sources/${item.id}/download`}>Original</a>
                    {item.parseState !== "ready" ? (
                      <button
                        className="text-button"
                        onClick={async () => {
                          const result = await apiRequest(
                            `${base}/sources/${item.id}/retry`,
                            "POST",
                            {},
                          );
                          if (result.ok) refresh("Source parsing retried.");
                          else setMessage(result.message);
                        }}
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {!overview.sources.length ? (
                <p className="empty-copy">No source has been preserved yet.</p>
              ) : null}
            </div>
          </section>

          <section className="commercial-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Immutable version lineage</p>
                <h2>Baseline control</h2>
              </div>
              {overview.baseline ? (
                <span className="baseline-version">
                  {overview.baseline.state === "draft"
                    ? "Draft"
                    : `Version ${overview.baseline.versionNumber}`}
                </span>
              ) : null}
            </div>
            {!overview.baseline ? (
              <form onSubmit={createBaseline} className="baseline-create-form">
                <label>
                  Ready source
                  <select name="sourceId" required defaultValue="">
                    <option value="" disabled>
                      Choose a parsed source
                    </option>
                    {readySources.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={!readySources.length || pending}>
                  Create baseline v1
                </button>
              </form>
            ) : overview.baseline.state === "effective" ? (
              <form onSubmit={createAmendment} className="baseline-create-form">
                <label>
                  Amendment label
                  <input
                    name="label"
                    required
                    maxLength={160}
                    placeholder="e.g. Phase 2 signed amendment"
                  />
                </label>
                <label>
                  Amendment source
                  <select name="sourceId" required defaultValue="">
                    <option value="" disabled>
                      Choose a parsed amendment
                    </option>
                    {readySources.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {decisionOptions.length ? (
                  <fieldset className="amendment-decisions">
                    <legend>Formalize decisions (optional)</legend>
                    {decisionOptions.map((decision) => (
                      <label key={decision.id}>
                        <input
                          type="checkbox"
                          name="decisionIds"
                          value={decision.id}
                        />
                        {decision.requestTitle} ·{" "}
                        {decision.disposition.replaceAll("_", " ")}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <button disabled={!readySources.length || pending}>
                  Prepare amendment draft
                </button>
              </form>
            ) : (
              <div className="baseline-draft-control">
                <p className="baseline-note">
                  Editing <strong>{overview.baseline.label}</strong>. Carried
                  items preserve their prior material basis until revised or
                  retired.
                </p>
                <button
                  onClick={activateVersion}
                  disabled={
                    pending ||
                    !overview.scopeItems.some((item) => !item.archivedAt)
                  }
                >
                  Make version effective
                </button>
              </div>
            )}
          </section>

          <section className="commercial-section scope-ledger-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Human curated</p>
                <h2>Scope ledger</h2>
              </div>
              <span className="metadata">
                {overview.scopeItems.length} items
              </span>
            </div>
            {overview.baseline?.state === "draft" ? (
              <form onSubmit={saveScope} className="scope-item-form">
                <div className="scope-form-row">
                  <label>
                    Kind
                    <select
                      name="kind"
                      defaultValue={editing?.kind || "deliverable"}
                      key={editing?.id || "new-kind"}
                    >
                      <option value="deliverable">Deliverable</option>
                      <option value="requirement">Requirement</option>
                      <option value="exclusion">Exclusion</option>
                      <option value="constraint">Constraint</option>
                    </select>
                  </label>
                  <label className="scope-title-field">
                    Scope item
                    <input
                      name="title"
                      required
                      maxLength={240}
                      defaultValue={editing?.title || ""}
                      key={editing?.id || "new-title"}
                    />
                  </label>
                </div>
                <label>
                  Details
                  <textarea
                    name="details"
                    rows={3}
                    maxLength={10000}
                    defaultValue={editing?.details || ""}
                    key={editing?.id || "new-details"}
                  />
                </label>
                <label>
                  Evidence label
                  <input
                    name="anchorLabel"
                    maxLength={120}
                    placeholder="e.g. Deliverables, paragraph 2"
                  />
                </label>
                <div className="selected-evidence">
                  <span>Selected evidence</span>
                  <blockquote>
                    {selectedExcerpt ||
                      "Select supporting text in the inspector."}
                  </blockquote>
                </div>
                <div className="scope-form-actions">
                  <button disabled={pending || !selectedExcerpt}>
                    {editing ? "Preserve revision" : "Add scope item"}
                  </button>
                  {editing ? (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setEditing(null)}
                    >
                      Cancel revision
                    </button>
                  ) : null}
                </div>
              </form>
            ) : overview.baseline ? (
              <p className="empty-copy">
                Effective baseline versions are immutable. Prepare an amendment
                to change scope.
              </p>
            ) : (
              <p className="empty-copy">
                Create the initial baseline before curating scope.
              </p>
            )}
            <div className="scope-ledger">
              {overview.scopeItems.map((item) => (
                <article
                  key={item.id}
                  className={
                    item.archivedAt ? "scope-item-archived" : undefined
                  }
                >
                  <span className={`scope-kind scope-${item.kind}`}>
                    {item.kind}
                  </span>
                  <div>
                    <div className="scope-item-title">
                      <strong>{item.title}</strong>
                      {item.lineageKind ? (
                        <span
                          className={`lineage-kind lineage-${item.lineageKind}`}
                        >
                          {item.lineageKind.replaceAll("_", " ")}
                        </span>
                      ) : null}
                    </div>
                    {item.details ? <p>{item.details}</p> : null}
                    <span className="metadata">
                      Revision {item.revisionNumber} · {item.anchors.length}{" "}
                      evidence anchor{item.anchors.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="commercial-row-actions">
                    <button
                      className="text-button"
                      onClick={() => inspectAnchor(item)}
                    >
                      Evidence
                    </button>
                    {overview.baseline?.state === "draft" &&
                    !item.archivedAt ? (
                      <button
                        className="text-button"
                        onClick={() => {
                          setEditing(item);
                          inspectAnchor(item);
                        }}
                      >
                        Revise
                      </button>
                    ) : null}
                    {overview.baseline?.state === "draft" ? (
                      <button
                        className="text-button"
                        onClick={() => archiveScope(item)}
                      >
                        {item.archivedAt ? "Restore" : "Retire"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <BaselineHistory history={history} />
        </div>

        <EvidenceInspector
          source={source}
          loading={loadingSource}
          selection={selection}
          sourceTextRef={sourceTextRef}
          onSelectionChange={setSelection}
        />
      </div>
      {exposurePanel}
      {changeControl}
    </main>
  );
}

function BaselineHistory({
  history,
}: Readonly<{ history: CommercialHistory }>) {
  return (
    <section className="commercial-section baseline-history-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recorded and effective time</p>
          <h2>Baseline history</h2>
        </div>
        <span className="metadata">{history.page.total} versions</span>
      </div>
      <div className="baseline-history">
        {history.data.map((version) => (
          <details key={version.id} open={version.state !== "superseded"}>
            <summary>
              <span className={`baseline-version version-${version.state}`}>
                {version.state === "draft"
                  ? "Draft"
                  : `v${version.versionNumber}`}
              </span>
              <strong>{version.label}</strong>
              <span>{version.sourceName}</span>
            </summary>
            <dl>
              <div>
                <dt>Recorded</dt>
                <dd>
                  {formatTimestamp(version.recordedAt)} by{" "}
                  {version.createdByName}
                </dd>
              </div>
              <div>
                <dt>Effective</dt>
                <dd>
                  {version.effectiveAt
                    ? formatTimestamp(version.effectiveAt)
                    : "Not yet"}
                </dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{version.scopeItems} items</dd>
              </div>
            </dl>
            <p className="metadata">
              Evidence:{" "}
              {version.sources.map((source) => source.name).join(" · ")}
            </p>
            {Object.keys(version.lineage).length ? (
              <div
                className="lineage-summary"
                aria-label="Scope lineage summary"
              >
                {(
                  ["carried_forward", "revised", "added", "retired"] as const
                ).map((kind) =>
                  version.lineage[kind] ? (
                    <span className={`lineage-kind lineage-${kind}`} key={kind}>
                      {version.lineage[kind]} {kind.replaceAll("_", " ")}
                    </span>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="metadata">Initial scope foundation</p>
            )}
            {version.changes.length ? (
              <ul className="version-changes">
                {version.changes.map((change) => (
                  <li key={change.currentScopeItemId}>
                    <span className={`lineage-kind lineage-${change.kind}`}>
                      {change.kind.replaceAll("_", " ")}
                    </span>
                    <span>
                      {change.scopeKind} · {change.title}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {version.items.length ? (
              <details className="version-scope-detail">
                <summary>Inspect scope and authorized work</summary>
                <ul className="version-changes">
                  {version.items.map((item) => (
                    <li key={item.id}>
                      <span className={`scope-kind scope-${item.scopeKind}`}>
                        {item.scopeKind}
                      </span>
                      <span>{item.title}</span>
                      <span className="metadata">
                        {item.workLinks} linked work item
                        {item.workLinks === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {version.decisions.length ? (
              <ul className="version-decisions">
                {version.decisions.map((decision) => (
                  <li key={decision.decisionId}>
                    {decision.requestTitle} ·{" "}
                    {decision.disposition.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        ))}
      </div>
      {history.page.pages > 1 ? (
        <nav className="pagination" aria-label="Baseline history pages">
          {history.page.number > 1 ? (
            <Link href={`?historyPage=${history.page.number - 1}`}>
              Previous
            </Link>
          ) : (
            <span>Previous</span>
          )}
          <span>
            Page {history.page.number} of {history.page.pages}
          </span>
          {history.page.number < history.page.pages ? (
            <Link href={`?historyPage=${history.page.number + 1}`}>Next</Link>
          ) : (
            <span>Next</span>
          )}
        </nav>
      ) : null}
    </section>
  );
}

function DriftLedger({
  drift,
  workspaceSlug,
  projectKey,
}: Readonly<{
  drift: DriftPage;
  workspaceSlug: string;
  projectKey: string;
}>) {
  return (
    <section className="commercial-section drift-ledger-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Advisory only</p>
          <h2>Active delivery drift</h2>
        </div>
        <span className="metadata">Warnings never block delivery actions</span>
      </div>
      <div className="drift-ledger">
        {drift.data.map((item) => (
          <Link
            href={`/app/${workspaceSlug}/projects/${projectKey}/work/${item.id}`}
            key={item.id}
          >
            <span className={`drift-state drift-${item.state}`}>
              {driftLabel(item.state)}
            </span>
            <strong>
              {projectKey}-{item.number} · {item.title}
            </strong>
            <span>{item.status.replaceAll("_", " ")}</span>
          </Link>
        ))}
        {!drift.data.length ? (
          <p className="empty-copy">No active work needs commercial review.</p>
        ) : null}
      </div>
      {drift.page.pages > 1 ? (
        <nav className="pagination" aria-label="Commercial drift pages">
          {drift.page.number > 1 ? (
            <Link href={`?page=${drift.page.number - 1}`}>Previous</Link>
          ) : (
            <span>Previous</span>
          )}
          <span>
            Page {drift.page.number} of {drift.page.pages}
          </span>
          {drift.page.number < drift.page.pages ? (
            <Link href={`?page=${drift.page.number + 1}`}>Next</Link>
          ) : (
            <span>Next</span>
          )}
        </nav>
      ) : null}
    </section>
  );
}

function EvidenceInspector({
  source,
  loading,
  selection,
  sourceTextRef,
  onSelectionChange,
}: Readonly<{
  source: SourceDetail | null;
  loading: boolean;
  selection: { start: number; end: number };
  sourceTextRef: RefObject<HTMLTextAreaElement | null>;
  onSelectionChange: (selection: { start: number; end: number }) => void;
}>) {
  function captureSelection() {
    const element = sourceTextRef.current;
    if (!element) return;
    onSelectionChange({
      start: element.selectionStart,
      end: element.selectionEnd,
    });
  }

  let content = (
    <p className="empty-copy">
      Inspect a source to select evidence for a scope item.
    </p>
  );
  if (source?.parseState === "ready" && source.extractedText) {
    content = (
      <>
        <p className="metadata">
          Select exact supporting text. Anchors store normalized character
          offsets, not copied contract text.
        </p>
        <textarea
          ref={sourceTextRef}
          className="source-text-inspector"
          readOnly
          value={source.extractedText}
          onSelect={captureSelection}
          onKeyUp={captureSelection}
          onMouseUp={captureSelection}
        />
        <div className="evidence-offsets">
          <span>Start {selection.start}</span>
          <span>End {selection.end}</span>
          <span>{Math.max(0, selection.end - selection.start)} chars</span>
        </div>
      </>
    );
  } else if (source) {
    content = (
      <p className="empty-copy">
        {parseStateLabel(source)}. The original is preserved; retry parsing or
        add pasted text as a fallback.
      </p>
    );
  }

  return (
    <aside className="evidence-inspector" aria-label="Evidence inspector">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Evidence inspector</p>
          <h2>{source?.name || "Choose a source"}</h2>
        </div>
      </div>
      {loading ? <p>Loading source…</p> : null}
      {content}
    </aside>
  );
}

type WorkProvenance = {
  id: string;
  purpose: "unclassified" | "client_delivery" | "delivery_support" | "internal";
  state:
    | "commercially_unlinked"
    | "needs_classification"
    | "linked"
    | "stale_basis"
    | "support_internal";
  links: Array<{
    id: string;
    basisType: "baseline_scope_item" | "commercial_decision";
    scopeItemRevisionId: string | null;
    revisionNumber: number | null;
    kind: string | null;
    title: string | null;
    archivedAt: string | Date | null;
    decisionId: string | null;
    requestTitle: string | null;
    disposition:
      | "covered"
      | "absorbed"
      | "swap"
      | "paid_change"
      | "deferred"
      | "rejected"
      | null;
    coverageBasis: string | null;
    decisionConfirmedAt: string | Date | null;
    decisionSupersededAt: string | Date | null;
    effective: boolean;
    stale: boolean;
    contradiction: boolean;
  }>;
};

type BasisOption =
  | {
      basisType: "baseline_scope_item";
      scopeItemRevisionId: string;
      revisionNumber: number;
      kind: string;
      title: string;
    }
  | {
      basisType: "commercial_decision";
      decisionId: string;
      requestId: string;
      requestTitle: string;
      disposition:
        | "covered"
        | "absorbed"
        | "swap"
        | "paid_change"
        | "deferred"
        | "rejected";
      coverageBasis: string | null;
      confirmedAt: string | Date;
    };

export function WorkCommercialPanel({
  workspaceId,
  projectId,
  provenance,
  options,
  canManage,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  provenance: WorkProvenance;
  options: BasisOption[];
  canManage: boolean;
}>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const base = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/work-items/${provenance.id}/commercial`;

  function refresh(text: string) {
    setMessage(text);
    startTransition(() => router.refresh());
  }

  async function classify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await apiRequest(base, "PATCH", {
      purpose: formData.get("purpose"),
    });
    if (result.ok) refresh("Commercial purpose updated.");
    else setMessage(result.message);
  }

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const [basisType, targetId] = String(formData.get("basis") || "").split(
      ":",
      2,
    );
    if (!targetId) return setMessage("Choose a commercial basis.");
    const result = await apiRequest(`${base}/links`, "POST", {
      basisType,
      ...(basisType === "commercial_decision"
        ? { decisionId: targetId }
        : { scopeItemRevisionId: targetId }),
    });
    if (result.ok) refresh("Commercial provenance linked.");
    else setMessage(result.message);
  }

  async function unlink(linkId: string) {
    const result = await apiRequest(`${base}/links/${linkId}`, "DELETE", {});
    if (result.ok) refresh("Commercial basis removed.");
    else setMessage(result.message);
  }

  return (
    <section
      className="work-commercial-panel"
      aria-labelledby="work-commercial-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Commercial provenance</p>
          <h2 id="work-commercial-title">{driftLabel(provenance.state)}</h2>
        </div>
        <span
          className={`commercial-badge commercial-${provenance.state.replaceAll("_", "-")}`}
        >
          {provenance.purpose.replaceAll("_", " ")}
        </span>
      </div>
      <p className="metadata">
        This advisory status explains why the work exists commercially. It never
        blocks delivery.
      </p>
      {message ? <p role="status">{message}</p> : null}
      {canManage ? (
        <div className="work-commercial-controls">
          <form onSubmit={classify}>
            <AppField id="commercial-work-purpose" label="Work purpose">
              <AppSelect name="purpose" defaultValue={provenance.purpose}>
                <option value="unclassified">Unclassified</option>
                <option value="client_delivery">Client delivery</option>
                <option value="delivery_support">Delivery support</option>
                <option value="internal">Internal</option>
              </AppSelect>
            </AppField>
            <AppButton type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Updating…" : "Update classification"}
            </AppButton>
          </form>
          <form onSubmit={link}>
            <AppField id="commercial-basis" label="Commercial basis" required>
              <AppSelect name="basis" defaultValue="">
                <option value="" disabled>
                  Choose scope or decision
                </option>
                {options.map((option) => (
                  <option
                    value={
                      option.basisType === "commercial_decision"
                        ? `commercial_decision:${option.decisionId}`
                        : `baseline_scope_item:${option.scopeItemRevisionId}`
                    }
                    key={
                      option.basisType === "commercial_decision"
                        ? option.decisionId
                        : option.scopeItemRevisionId
                    }
                  >
                    {option.basisType === "commercial_decision"
                      ? `${option.disposition.replaceAll("_", " ")} · ${option.requestTitle}`
                      : `${option.kind} · ${option.title}`}
                  </option>
                ))}
              </AppSelect>
            </AppField>
            <AppButton
              type="submit"
              disabled={pending || !options.length}
              aria-busy={pending}
            >
              {pending ? "Linking…" : "Link commercial basis"}
            </AppButton>
          </form>
        </div>
      ) : null}
      <div className="work-commercial-links">
        {provenance.links.map((link) => (
          <div key={link.id}>
            <span
              className={`scope-kind ${link.kind ? `scope-${link.kind}` : "scope-decision"}`}
            >
              {link.basisType === "commercial_decision"
                ? link.disposition?.replaceAll("_", " ")
                : link.kind}
            </span>
            <div>
              <strong>
                {link.basisType === "commercial_decision"
                  ? link.requestTitle || "Confirmed commercial decision"
                  : link.title}
              </strong>
              {link.basisType === "commercial_decision" ? (
                <span>
                  {link.coverageBasis
                    ? `Coverage: ${link.coverageBasis.replaceAll("_", " ")}`
                    : "Decision-backed work"}
                  {link.decisionSupersededAt ? " · superseded" : ""}
                  {link.contradiction ? " · review required" : ""}
                </span>
              ) : (
                <span>
                  Baseline revision {link.revisionNumber}
                  {link.archivedAt ? " · archived historically" : ""}
                </span>
              )}
            </div>
            {canManage ? (
              <button
                type="button"
                className="text-button"
                onClick={() => unlink(link.id)}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {!provenance.links.length ? (
          <p className="empty-copy">No commercial basis is linked.</p>
        ) : null}
      </div>
    </section>
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string | Date) {
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function sourceKindLabel(kind: Source["kind"]) {
  return kind === "pasted_text" ? "Pasted text" : kind.toUpperCase();
}

function parseStateLabel(
  source: Pick<Source, "parseState" | "parseErrorCode">,
) {
  if (source.parseState === "ready") return "Ready";
  if (source.parseState === "needs_ocr")
    return "Needs OCR — paste text fallback";
  return source.parseErrorCode?.replaceAll("_", " ") || "Parsing failed";
}

function driftLabel(state: DriftItem["state"]) {
  return {
    commercially_unlinked: "Unlinked",
    needs_classification: "Classify",
    linked: "Linked",
    stale_basis: "Stale basis",
    support_internal: "No basis needed",
  }[state];
}
