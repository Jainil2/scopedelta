"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";

import type { ClientProjectProjection } from "@/lib/client-project-projection";

type Participant = {
  id: string;
  name: string;
  email: string;
  role: "collaborator" | "approver";
  revokedAt: Date | null;
};

type Invitation = {
  id: string;
  email: string;
  role: "collaborator" | "approver";
  state: "pending" | "accepted" | "revoked";
  expiresAt: Date;
  emailDeliveryState: "not_requested" | "pending" | "sent" | "failed";
};

type RequestOption = {
  id: string;
  title: string;
  state: string;
  decision: { id: string; disposition: string } | null;
  impacts: Array<{
    id: string;
    decisionId: string | null;
    confidence: "estimate" | "confirmed";
    scheduleDeltaDays: number | null;
    targetDate: string | null;
    monetaryAmount: string | null;
    currencyCode: string | null;
  }>;
};

async function request<T>(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = (await response.json()) as {
    data?: T;
    error?: { message: string };
  };
  if (!response.ok || result.data === undefined) {
    throw new Error(result.error?.message ?? "The request failed.");
  }
  return result.data;
}

function formString(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export function ClientCollaborationWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  preview,
  participants,
  invitations,
  milestones,
  requests,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: { id: string; key: string; name: string };
  preview: ClientProjectProjection;
  participants: Participant[];
  invitations: Invitation[];
  milestones: Array<{ id: string; name: string }>;
  requests: RequestOption[];
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const keys = useRef(new Map<string, string>());
  const base = `/api/v1/workspaces/${workspaceId}/projects/${project.id}/client`;

  function keyFor(scope: string) {
    const existing = keys.current.get(scope);
    if (existing) return existing;
    const created = crypto.randomUUID();
    keys.current.set(scope, created);
    return created;
  }

  function done(scope: string, text: string) {
    keys.current.delete(scope);
    setMessage(text);
    startTransition(() => router.refresh());
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request(base, "PATCH", { summary: data.get("summary") });
      done("profile", "Client-safe project summary updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update summary.",
      );
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const scope = "invite";
    try {
      const result = await request<{ fragmentPath: string }>(
        `${base}/participants`,
        "POST",
        {
          idempotencyKey: keyFor(scope),
          email: data.get("email"),
          role: data.get("role"),
          sendEmail: false,
        },
      );
      setInviteUrl(`${window.location.origin}${result.fragmentPath}`);
      done(scope, "Invitation created. Copy the secure fragment link below.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create invitation.",
      );
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setMessage("Invitation link copied.");
  }

  async function reissue(invitationId: string) {
    const scope = `reissue:${invitationId}`;
    try {
      const result = await request<{ fragmentPath: string }>(
        `${base}/invitations/${invitationId}/reissue`,
        "POST",
        { idempotencyKey: keyFor(scope), sendEmail: false },
      );
      setInviteUrl(`${window.location.origin}${result.fragmentPath}`);
      done(scope, "Invitation token rotated. Copy the new link below.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not reissue invitation.",
      );
    }
  }

  async function changeParticipant(
    participantId: string,
    method: "PATCH" | "DELETE",
    role?: "collaborator" | "approver",
  ) {
    try {
      await request(
        `${base}/participants/${participantId}`,
        method,
        role ? { role } : undefined,
      );
      done(
        `participant:${participantId}`,
        method === "DELETE" ? "Client access revoked." : "Client role updated.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update access.",
      );
    }
  }

  async function addMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const scope = `item:${formString(data, "milestoneId")}`;
    try {
      await request(`${base}/items`, "POST", {
        idempotencyKey: keyFor(scope),
        target: "milestone",
        milestoneId: data.get("milestoneId"),
        clientSummary: data.get("clientSummary"),
        sortOrder: 0,
      });
      form.reset();
      done(scope, "Milestone added to the client projection.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add milestone.",
      );
    }
  }

  async function publishPacket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const requestId = formString(data, "requestId");
    const scope = `packet:${requestId}`;
    const impactId = formString(data, "impactAssessmentId");
    try {
      await request(`${base}/requests/${requestId}/packets`, "POST", {
        idempotencyKey: keyFor(scope),
        decisionId: data.get("decisionId"),
        impactAssessmentId: impactId || null,
        title: data.get("title"),
        requestSummary: data.get("requestSummary"),
        treatmentSummary: data.get("treatmentSummary"),
        scopeSummary: null,
        assumptions: null,
        includeScheduleDeltaDays: Boolean(impactId),
        includeTargetDate: Boolean(impactId),
        includeMonetaryAmount: Boolean(impactId),
        scopeItemRevisionIds: [],
      });
      done(scope, "A new immutable client packet version was published.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not publish packet.",
      );
    }
  }

  async function publishAcceptance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const itemId = formString(data, "projectItemId");
    const scope = `acceptance:${itemId}`;
    try {
      await request(`${base}/acceptance-targets`, "POST", {
        idempotencyKey: keyFor(scope),
        projectItemId: itemId,
        snapshotTitle: data.get("snapshotTitle"),
        snapshotSummary: data.get("snapshotSummary"),
        packetIds: [],
      });
      done(scope, "A new immutable acceptance target was published.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not publish acceptance target.",
      );
    }
  }

  return (
    <div className="delivery-stack client-management">
      <header className="delivery-page-header">
        <div>
          <p className="eyebrow">External projection</p>
          <h1>Client collaboration</h1>
          <p>
            Publish a deliberately smaller, client-safe view. Internal authority
            remains separate.
          </p>
        </div>
      </header>
      <nav className="project-tabs" aria-label="Project">
        <Link href={`/app/${workspaceSlug}/projects/${project.key}`}>
          Overview
        </Link>
        <Link href={`/app/${workspaceSlug}/projects/${project.key}/backlog`}>
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
        <Link href={`/app/${workspaceSlug}/projects/${project.key}/commercial`}>
          Commercial
        </Link>
        <Link
          aria-current="page"
          href={`/app/${workspaceSlug}/projects/${project.key}/client`}
        >
          Client view
        </Link>
        <Link href={`/app/${workspaceSlug}/projects/${project.key}/activity`}>
          Activity
        </Link>
      </nav>
      {message ? (
        <p role="status" className="client-alert">
          {pending ? "Refreshing…" : message}
        </p>
      ) : null}

      <section className="management-grid">
        <div className="management-panel">
          <p className="eyebrow">Safe project profile</p>
          <h2>What clients see first</h2>
          <form className="delivery-form" onSubmit={saveProfile}>
            <label>
              <span>Client summary</span>
              <textarea
                name="summary"
                required
                maxLength={2_000}
                rows={6}
                defaultValue={preview.project.summary ?? ""}
              />
            </label>
            <button type="submit" disabled={pending}>
              Save client summary
            </button>
          </form>
        </div>
        <div className="management-panel">
          <p className="eyebrow">Access</p>
          <h2>Invite a participant</h2>
          <form className="delivery-form" onSubmit={invite}>
            <label>
              <span>Email</span>
              <input name="email" type="email" required maxLength={320} />
            </label>
            <label>
              <span>Role</span>
              <select name="role">
                <option value="collaborator">Collaborator</option>
                <option value="approver">Approver</option>
              </select>
            </label>
            <button type="submit" disabled={pending}>
              Create invitation
            </button>
          </form>
          {inviteUrl ? (
            <div className="copy-link-row">
              <input
                aria-label="Copyable client invitation"
                readOnly
                value={inviteUrl}
              />
              <button type="button" onClick={() => void copyInvite()}>
                Copy
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="management-panel">
        <p className="eyebrow">Participants</p>
        <h2>Current client access</h2>
        {participants.map((participant) => (
          <div className="member-row" key={participant.id}>
            <div>
              <strong>{participant.name}</strong>
              <span>
                {participant.email}
                {participant.revokedAt ? " · revoked" : ""}
              </span>
            </div>
            {!participant.revokedAt ? (
              <div className="inline-controls">
                <select
                  aria-label={`Role for ${participant.name}`}
                  value={participant.role}
                  onChange={(event) =>
                    void changeParticipant(
                      participant.id,
                      "PATCH",
                      event.target.value as "collaborator" | "approver",
                    )
                  }
                >
                  <option value="collaborator">Collaborator</option>
                  <option value="approver">Approver</option>
                </select>
                <button
                  type="button"
                  className="app-text-button danger-button"
                  onClick={() =>
                    void changeParticipant(participant.id, "DELETE")
                  }
                >
                  Revoke
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {invitations
          .filter((invitation) => invitation.state === "pending")
          .map((invitation) => (
            <div className="member-row" key={invitation.id}>
              <div>
                <strong>{invitation.email}</strong>
                <span>
                  Pending {invitation.role} · email{" "}
                  {invitation.emailDeliveryState}
                </span>
              </div>
              <button
                type="button"
                className="app-text-button"
                onClick={() => void reissue(invitation.id)}
              >
                Rotate link
              </button>
            </div>
          ))}
      </section>

      <section className="management-grid">
        <div className="management-panel">
          <p className="eyebrow">Visibility</p>
          <h2>Share a milestone</h2>
          <form className="delivery-form" onSubmit={addMilestone}>
            <label>
              <span>Milestone</span>
              <select name="milestoneId" required>
                <option value="">Choose milestone</option>
                {milestones.map((milestone) => (
                  <option value={milestone.id} key={milestone.id}>
                    {milestone.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Client-safe summary</span>
              <textarea
                name="clientSummary"
                required
                maxLength={2_000}
                rows={4}
              />
            </label>
            <button type="submit" disabled={pending}>
              Add to client view
            </button>
          </form>
        </div>
        <div className="management-panel preview-panel">
          <p className="eyebrow">Exact projection preview</p>
          <h2>{preview.project.name}</h2>
          <p>{preview.project.summary ?? "No client summary published."}</p>
          {preview.items.map((item) => (
            <article key={item.id}>
              <span>{item.target}</span>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="management-panel">
        <p className="eyebrow">Commercial publication</p>
        <h2>Publish the current internal decision</h2>
        <div className="publication-grid">
          {requests
            .filter((item) => item.decision)
            .map((item) => {
              const confirmed = item.impacts.filter(
                (impact) =>
                  impact.confidence === "confirmed" &&
                  impact.decisionId === item.decision?.id,
              );
              return (
                <form
                  className="delivery-form publication-form"
                  onSubmit={publishPacket}
                  key={item.id}
                >
                  <input type="hidden" name="requestId" value={item.id} />
                  <input
                    type="hidden"
                    name="decisionId"
                    value={item.decision!.id}
                  />
                  <span className="commercial-badge commercial-linked">
                    Internal: {item.decision!.disposition.replace("_", " ")}
                  </span>
                  <h3>{item.title}</h3>
                  <label>
                    <span>Client title</span>
                    <input
                      name="title"
                      required
                      defaultValue={item.title}
                      maxLength={240}
                    />
                  </label>
                  <label>
                    <span>Safe request summary</span>
                    <textarea
                      name="requestSummary"
                      required
                      rows={3}
                      maxLength={5_000}
                    />
                  </label>
                  <label>
                    <span>Safe treatment summary</span>
                    <textarea
                      name="treatmentSummary"
                      required
                      rows={3}
                      maxLength={5_000}
                    />
                  </label>
                  <label>
                    <span>Confirmed values</span>
                    <select name="impactAssessmentId">
                      <option value="">Do not publish values</option>
                      {confirmed.map((impact) => (
                        <option value={impact.id} key={impact.id}>
                          {impact.currencyCode && impact.monetaryAmount
                            ? `${impact.currencyCode} ${impact.monetaryAmount}`
                            : "Confirmed schedule"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={pending}>
                    Publish successor packet
                  </button>
                </form>
              );
            })}
        </div>
      </section>

      <section className="management-panel">
        <p className="eyebrow">Acceptance publication</p>
        <h2>Ask an approver to accept an exact version</h2>
        <div className="publication-grid">
          {preview.items.map((item) => (
            <form
              className="delivery-form publication-form"
              onSubmit={publishAcceptance}
              key={item.id}
            >
              <input type="hidden" name="projectItemId" value={item.id} />
              <span className="client-chip">{item.target}</span>
              <h3>{item.title}</h3>
              <label>
                <span>Acceptance title</span>
                <input
                  name="snapshotTitle"
                  required
                  defaultValue={item.title}
                  maxLength={240}
                />
              </label>
              <label>
                <span>What is being accepted?</span>
                <textarea
                  name="snapshotSummary"
                  required
                  defaultValue={item.summary}
                  rows={4}
                  maxLength={5_000}
                />
              </label>
              <button type="submit" disabled={pending}>
                Publish successor target
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="management-panel separate-facts">
        <p className="eyebrow">Separate evidence</p>
        <h2>Internal authority and client actions</h2>
        {preview.packets.map((packet) => (
          <article key={packet.id}>
            <div>
              <span>Internal decision</span>
              <strong>{packet.disposition.replace("_", " ")}</strong>
            </div>
            <div>
              <span>Client action</span>
              <strong>
                {packet.action?.action.replace("_", " ") ?? "No action yet"}
              </strong>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
