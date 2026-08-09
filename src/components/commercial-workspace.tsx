"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type RefObject,
} from "react";

import { apiRequest, type Project } from "@/components/delivery-workspace";
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
    versionNumber: number;
    sourceId: string;
    createdAt: string | Date;
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
  state:
    | "commercially_unlinked"
    | "needs_classification"
    | "linked"
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
  supportInternal: number;
};

export function CommercialWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  initialOverview,
  drift,
  driftSummary,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: Project;
  initialOverview: Overview;
  drift: DriftPage;
  driftSummary: DriftSummary;
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
    if (overview.baseline && !source)
      void loadSource(overview.baseline.sourceId);
    // The baseline source is immutable in SC-006A.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.baseline?.sourceId]);

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
      requestId: crypto.randomUUID(),
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
          requestId: crypto.randomUUID(),
        })
      : await apiRequest(`${base}/scope-items`, "POST", {
          ...content,
          requestId: crypto.randomUUID(),
          revisionRequestId: crypto.randomUUID(),
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
          <strong>{driftSummary.supportInternal}</strong>
          <span>Support / internal</span>
        </div>
      </section>

      {message ? (
        <p className="commercial-message" role="status">
          {message}
        </p>
      ) : null}

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
                <label>
                  Source name
                  <input
                    name="pasteName"
                    maxLength={160}
                    defaultValue="Pasted commercial source"
                  />
                </label>
                <label>
                  Commercial text
                  <textarea
                    name="pastedText"
                    rows={8}
                    maxLength={500000}
                    placeholder="Paste the agreed SOW, proposal or contract extract"
                  />
                </label>
                <label>
                  PDF or DOCX
                  <input
                    name="sourceFile"
                    type="file"
                    accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                  />
                </label>
                <button disabled={pending}>Preserve source</button>
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
                <p className="eyebrow">Immutable foundation</p>
                <h2>Initial baseline</h2>
              </div>
              {overview.baseline ? (
                <span className="baseline-version">
                  Version {overview.baseline.versionNumber}
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
            ) : (
              <p className="baseline-note">
                Version 1 is fixed to its preserved source. Later amendment
                versions belong to SC-006C.
              </p>
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
            {overview.baseline ? (
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
                    <strong>{item.title}</strong>
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
                    {!item.archivedAt ? (
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
                    <button
                      className="text-button"
                      onClick={() => archiveScope(item)}
                    >
                      {item.archivedAt ? "Restore" : "Archive"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <DriftLedger
            drift={drift}
            workspaceSlug={workspaceSlug}
            projectKey={project.key}
          />
        </div>

        <EvidenceInspector
          source={source}
          loading={loadingSource}
          selection={selection}
          sourceTextRef={sourceTextRef}
          onSelectionChange={setSelection}
        />
      </div>
    </main>
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
          onSelect={(event) =>
            onSelectionChange({
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            })
          }
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
    | "support_internal";
  links: Array<{
    id: string;
    scopeItemRevisionId: string;
    revisionNumber: number;
    kind: string;
    title: string;
    archivedAt: string | Date | null;
  }>;
};

type BasisOption = {
  scopeItemRevisionId: string;
  revisionNumber: number;
  kind: string;
  title: string;
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
    const result = await apiRequest(`${base}/links`, "POST", {
      scopeItemRevisionId: formData.get("scopeItemRevisionId"),
    });
    if (result.ok) refresh("Baseline provenance linked.");
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
            <label>
              Work purpose
              <select name="purpose" defaultValue={provenance.purpose}>
                <option value="unclassified">Unclassified</option>
                <option value="client_delivery">Client delivery</option>
                <option value="delivery_support">Delivery support</option>
                <option value="internal">Internal</option>
              </select>
            </label>
            <button disabled={pending}>Update classification</button>
          </form>
          <form onSubmit={link}>
            <label>
              Baseline scope
              <select name="scopeItemRevisionId" required defaultValue="">
                <option value="" disabled>
                  Choose current scope
                </option>
                {options.map((option) => (
                  <option
                    value={option.scopeItemRevisionId}
                    key={option.scopeItemRevisionId}
                  >
                    {option.kind} · {option.title}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={pending || !options.length}>
              Link commercial basis
            </button>
          </form>
        </div>
      ) : null}
      <div className="work-commercial-links">
        {provenance.links.map((link) => (
          <div key={link.id}>
            <span className={`scope-kind scope-${link.kind}`}>{link.kind}</span>
            <div>
              <strong>{link.title}</strong>
              <span>
                Baseline revision {link.revisionNumber}
                {link.archivedAt ? " · archived historically" : ""}
              </span>
            </div>
            {canManage ? (
              <button className="text-button" onClick={() => unlink(link.id)}>
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
    support_internal: "No basis needed",
  }[state];
}
