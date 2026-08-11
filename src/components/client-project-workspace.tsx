"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";

import type { ClientProjectProjection } from "@/lib/client-project-projection";

type ProjectOption = {
  id: string;
  name: string;
  role: "collaborator" | "approver";
};

async function apiRequest(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as {
    data?: unknown;
    error?: { message: string };
  };
  if (!response.ok)
    throw new Error(result.error?.message ?? "The request failed.");
}

function formString(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export function ClientProjectWorkspace({
  projects,
  projection,
  hasInternalAccess,
}: Readonly<{
  projects: ProjectOption[];
  projection: ClientProjectProjection;
  hasInternalAccess: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const retryKeys = useRef(new Map<string, string>());

  function keyFor(scope: string) {
    const existing = retryKeys.current.get(scope);
    if (existing) return existing;
    const created = crypto.randomUUID();
    retryKeys.current.set(scope, created);
    return created;
  }

  function refresh(scope: string, success: string) {
    retryKeys.current.delete(scope);
    setMessage(success);
    startTransition(() => router.refresh());
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const scope = "new-request";
    try {
      await apiRequest(
        `/api/v1/client/projects/${projection.project.id}/requests`,
        "POST",
        {
          idempotencyKey: keyFor(scope),
          title: data.get("title"),
          requestText: data.get("requestText"),
        },
      );
      form.reset();
      refresh(scope, "Request sent to the project team.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not send request.",
      );
    }
  }

  async function actOnPacket(
    packetId: string,
    action: "approved" | "rejected" | "clarification_requested",
  ) {
    const scope = `packet:${packetId}:${action}`;
    try {
      await apiRequest(
        `/api/v1/client/projects/${projection.project.id}/packets/${packetId}/actions`,
        "POST",
        { idempotencyKey: keyFor(scope), action, comment: null },
      );
      refresh(scope, "Your packet response was recorded.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not record response.",
      );
    }
  }

  async function actOnAcceptance(
    targetId: string,
    action: "accepted" | "needs_changes",
  ) {
    const scope = `acceptance:${targetId}:${action}`;
    try {
      await apiRequest(
        `/api/v1/client/projects/${projection.project.id}/acceptance-targets/${targetId}/actions`,
        "POST",
        { idempotencyKey: keyFor(scope), action, comment: null },
      );
      refresh(scope, "Your acceptance response was recorded.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not record response.",
      );
    }
  }

  async function submitDiscussion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const target = formString(data, "target");
    const [targetType, targetId] = target.split(":");
    const scope = `discussion:${target}`;
    try {
      await apiRequest(
        `/api/v1/client/projects/${projection.project.id}/discussion`,
        "POST",
        {
          idempotencyKey: keyFor(scope),
          target: targetType,
          targetId,
          body: data.get("body"),
        },
      );
      form.reset();
      refresh(scope, "Message added to the shared discussion.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add message.",
      );
    }
  }

  const discussionTargets = [
    ...projection.requests.map((request) => ({
      value: `request:${request.id}`,
      label: `Request · ${request.title}`,
    })),
    ...projection.packets.map((packet) => ({
      value: `packet:${packet.id}`,
      label: `Packet v${packet.version} · ${packet.title}`,
    })),
    ...projection.acceptanceTargets.map((target) => ({
      value: `acceptance_target:${target.id}`,
      label: `Acceptance v${target.version} · ${target.title}`,
    })),
  ];

  return (
    <main className="client-shell">
      <header className="client-topbar">
        <Link className="client-wordmark" href="/client">
          ScopeDelta <span>client</span>
        </Link>
        <nav aria-label="Client projects">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/client/projects/${project.id}`}
              aria-current={
                project.id === projection.project.id ? "page" : undefined
              }
            >
              {project.name}
            </Link>
          ))}
          <Link href="/client/notifications">Inbox</Link>
          {hasInternalAccess ? <Link href="/app">Team workspace</Link> : null}
        </nav>
      </header>

      <section className="client-hero">
        <p className="client-kicker">Shared project workspace</p>
        <h1>{projection.project.name}</h1>
        <p>
          {projection.project.summary ??
            "Your project team has not published a client summary yet."}
        </p>
        <span className="client-role">
          {projection.participant?.role === "approver"
            ? "Approver access"
            : "Collaborator access"}
        </span>
      </section>

      {message ? (
        <p className="client-alert" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

      <section
        className="client-section attention-section"
        aria-labelledby="attention-title"
      >
        <div className="client-section-heading">
          <div>
            <p className="client-kicker">Priority</p>
            <h2 id="attention-title">Needs your attention</h2>
          </div>
          <span>{projection.attention.length}</span>
        </div>
        {projection.attention.length ? (
          <div className="attention-list">
            {projection.attention.map((item) => (
              <a
                href={`?page=${item.historyPage}&pageSize=${projection.history.pageSize}#${item.kind}-${item.targetId}`}
                key={`${item.kind}-${item.targetId}`}
              >
                <span>{item.kind.replace("_", " ")}</span>
                <strong>{item.label}</strong>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="client-empty">
            You are up to date. New decisions will appear here.
          </p>
        )}
      </section>

      <section className="client-section" aria-labelledby="delivery-title">
        <div className="client-section-heading">
          <div>
            <p className="client-kicker">Visible delivery</p>
            <h2 id="delivery-title">What the team has shared</h2>
          </div>
        </div>
        <div className="client-card-grid">
          {projection.items.map((item) => (
            <article className="client-card" key={item.id}>
              <span className="client-chip">{item.target}</span>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <footer>
                <span>{item.status?.replace("_", " ") ?? "Deliverable"}</span>
                <span>{item.targetDate ?? "No published date"}</span>
              </footer>
            </article>
          ))}
          {!projection.items.length ? (
            <p className="client-empty">No delivery items are visible yet.</p>
          ) : null}
        </div>
      </section>

      <section
        className="client-section two-column"
        aria-labelledby="requests-title"
      >
        <div>
          <p className="client-kicker">Requests</p>
          <h2 id="requests-title">Ask for a change or clarification</h2>
          <p className="client-lede">
            A request starts a commercial review. It does not authorize delivery
            by itself.
          </p>
          <form className="client-form" onSubmit={submitRequest}>
            <label>
              <span>Short title</span>
              <input name="title" required maxLength={240} />
            </label>
            <label>
              <span>What would you like to change?</span>
              <textarea
                name="requestText"
                required
                maxLength={10_000}
                rows={5}
              />
            </label>
            <button
              type="submit"
              className="client-button primary"
              disabled={pending}
            >
              Send request
            </button>
          </form>
        </div>
        <div className="client-timeline">
          {projection.requests.map((request) => (
            <article id={`clarification-${request.id}`} key={request.id}>
              <span
                className={`client-chip ${request.needsReply ? "warm" : ""}`}
              >
                {request.state.replace("_", " ")}
              </span>
              <h3>{request.title}</h3>
              <p>{request.requestText}</p>
              <time>{new Date(request.receivedAt).toLocaleDateString()}</time>
              {projection.discussion
                .filter(
                  (entry) =>
                    entry.target === "request" && entry.targetId === request.id,
                )
                .map((entry) => (
                  <div className="client-discussion" key={entry.id}>
                    <strong>
                      {entry.author === "team"
                        ? "Project team · client-visible"
                        : "Client reply"}
                    </strong>
                    <p>{entry.body}</p>
                    <time>{new Date(entry.createdAt).toLocaleString()}</time>
                  </div>
                ))}
              {request.needsReply ? (
                <form className="client-form" onSubmit={submitDiscussion}>
                  <input
                    type="hidden"
                    name="target"
                    value={`request:${request.id}`}
                  />
                  <label>
                    <span>Reply to the project team</span>
                    <textarea name="body" required maxLength={5_000} rows={3} />
                  </label>
                  <button
                    type="submit"
                    className="client-button primary"
                    disabled={pending}
                  >
                    Send clarification reply
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="client-section" aria-labelledby="packets-title">
        <p className="client-kicker">Commercial record</p>
        <h2 id="packets-title">Published decisions</h2>
        <div className="client-record-list">
          {projection.packets.map((packet) => (
            <article id={`packet-${packet.id}`} key={packet.id}>
              <header>
                <div>
                  <span className="client-chip">
                    {packet.requirement} · v{packet.version}
                  </span>
                  <h3>{packet.title}</h3>
                </div>
                <span>{packet.current ? "Current" : "Superseded"}</span>
              </header>
              <p>{packet.requestSummary}</p>
              <div className="client-decision">
                <strong>{packet.disposition.replace("_", " ")}</strong>
                <p>{packet.treatmentSummary}</p>
              </div>
              {packet.monetaryAmount ? (
                <p className="client-commercial-value">
                  {packet.currencyCode} {packet.monetaryAmount}
                </p>
              ) : null}
              {packet.scheduleDeltaDays !== null ? (
                <p className="client-commercial-value">
                  Schedule change: {packet.scheduleDeltaDays} days
                </p>
              ) : null}
              {packet.targetDate ? (
                <p className="client-commercial-value">
                  Published target date: {packet.targetDate}
                </p>
              ) : null}
              {packet.action ? (
                <p className="client-recorded">
                  Recorded: {packet.action.action.replace("_", " ")}
                </p>
              ) : null}
              {!packet.action && packet.actionable ? (
                <div className="client-actions">
                  {packet.requirement === "approval" &&
                  projection.participant?.role === "approver" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void actOnPacket(packet.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void actOnPacket(packet.id, "rejected")}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      void actOnPacket(packet.id, "clarification_requested")
                    }
                  >
                    Ask for clarification
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!projection.packets.length ? (
            <p className="client-empty">
              No commercial decisions have been published.
            </p>
          ) : null}
        </div>
      </section>

      <section className="client-section" aria-labelledby="acceptance-title">
        <p className="client-kicker">Delivery acceptance</p>
        <h2 id="acceptance-title">Exact versions ready for review</h2>
        <div className="client-record-list">
          {projection.acceptanceTargets.map((target) => (
            <article id={`acceptance-${target.id}`} key={target.id}>
              <header>
                <div>
                  <span className="client-chip">
                    Acceptance · v{target.version}
                  </span>
                  <h3>{target.title}</h3>
                </div>
                <span>{target.current ? "Current" : "Superseded"}</span>
              </header>
              <p>{target.summary}</p>
              {target.packetIds.length ? (
                <div className="client-decision">
                  <strong>Commercial context</strong>
                  <ul>
                    {target.packetIds.map((packetId) => {
                      const packet = projection.packets.find(
                        (entry) => entry.id === packetId,
                      );
                      return (
                        <li key={packetId}>
                          <a href={`#packet-${packetId}`}>
                            {packet
                              ? `Packet v${packet.version} · ${packet.title}`
                              : `Published packet ${packetId}`}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {target.action ? (
                <p className="client-recorded">
                  Recorded: {target.action.action.replace("_", " ")}
                </p>
              ) : null}
              {!target.action && target.actionable ? (
                <div className="client-actions">
                  <button
                    type="button"
                    onClick={() => void actOnAcceptance(target.id, "accepted")}
                  >
                    Accept this version
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void actOnAcceptance(target.id, "needs_changes")
                    }
                  >
                    Needs changes
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!projection.acceptanceTargets.length ? (
            <p className="client-empty">Nothing is waiting for acceptance.</p>
          ) : null}
        </div>
      </section>

      <section
        className="client-section two-column"
        aria-labelledby="discussion-title"
      >
        <div>
          <p className="client-kicker">Shared discussion</p>
          <h2 id="discussion-title">Keep context beside the record</h2>
          {discussionTargets.length ? (
            <form className="client-form" onSubmit={submitDiscussion}>
              <label>
                <span>Discuss</span>
                <select name="target" required>
                  {discussionTargets.map((target) => (
                    <option value={target.value} key={target.value}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Message</span>
                <textarea name="body" required maxLength={5_000} rows={4} />
              </label>
              <button
                type="submit"
                className="client-button primary"
                disabled={pending}
              >
                Add message
              </button>
            </form>
          ) : (
            <p className="client-empty">
              A discussion can start after a request or publication exists.
            </p>
          )}
        </div>
        <div className="client-discussion">
          {projection.discussion.map((message) => (
            <article key={message.id}>
              <header>
                <strong>{message.authorName}</strong>
                <span>{message.author}</span>
              </header>
              <p>{message.body}</p>
              <time>{new Date(message.createdAt).toLocaleString()}</time>
            </article>
          ))}
        </div>
      </section>

      {projection.history.hasNewer || projection.history.hasOlder ? (
        <nav
          className="client-section client-actions"
          aria-label="Client history"
        >
          {projection.history.hasNewer ? (
            <Link
              href={`?page=${projection.history.page - 1}&pageSize=${projection.history.pageSize}`}
            >
              Newer history
            </Link>
          ) : null}
          <span>
            History page {projection.history.page} · up to{" "}
            {projection.history.pageSize} records per section
          </span>
          {projection.history.hasOlder ? (
            <Link
              href={`?page=${projection.history.page + 1}&pageSize=${projection.history.pageSize}`}
            >
              Older history
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
