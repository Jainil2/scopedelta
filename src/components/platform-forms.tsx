"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { WorkspaceRole } from "@/db/schema";

type ApiResult<T> =
  | { data: T }
  | { error: { message: string; fieldErrors?: Record<string, string[]> } };

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const result = (await response.json()) as ApiResult<T>;
  if (!response.ok || "error" in result) {
    throw new Error(
      "error" in result ? result.error.message : "The request failed.",
    );
  }
  return result.data;
}

export function WorkspaceCreateForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const workspace = await apiRequest<{ slug: string }>(
        "/api/v1/workspaces",
        {
          method: "POST",
          body: JSON.stringify({ name: String(data.get("name") ?? "") }),
        },
      );
      router.push(`/app/${workspace.slug}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the workspace.",
      );
      setPending(false);
    }
  }

  return (
    <form className="platform-form" onSubmit={submit}>
      <label className="platform-field" htmlFor="workspace-name">
        <span>
          Workspace name
          <small>Usually your company or delivery organization</small>
        </span>
        <input
          id="workspace-name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          autoComplete="organization"
        />
      </label>
      <button className="app-primary-button" type="submit" disabled={pending}>
        {pending ? "Creating workspace…" : "Create workspace"}
        <span aria-hidden="true">↗</span>
      </button>
      <p className="platform-status platform-status-error" role="alert">
        {message}
      </p>
    </form>
  );
}

export function WorkspaceSettingsForm({
  workspace,
}: {
  workspace: {
    id: string;
    name: string;
    timezone: string;
    role: WorkspaceRole;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const canEdit = workspace.role !== "member";
  const timezones = getTimeZones();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canEdit) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setStatus("");
    try {
      await apiRequest(`/api/v1/workspaces/${workspace.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          timezone: data.get("timezone"),
        }),
      });
      setStatus("Workspace settings saved.");
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save settings.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="platform-form settings-form" onSubmit={submit}>
      <label className="platform-field" htmlFor="settings-name">
        <span>Workspace name</span>
        <input
          id="settings-name"
          name="name"
          defaultValue={workspace.name}
          minLength={2}
          maxLength={100}
          required
          disabled={!canEdit}
        />
      </label>
      <label className="platform-field" htmlFor="settings-timezone">
        <span>
          Default time zone
          <small>IANA time zones keep workspace dates globally portable.</small>
        </span>
        <select
          id="settings-timezone"
          name="timezone"
          defaultValue={workspace.timezone}
          disabled={!canEdit}
        >
          {timezones.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone}
            </option>
          ))}
        </select>
      </label>
      {canEdit ? (
        <button className="app-primary-button" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
          <span aria-hidden="true">↗</span>
        </button>
      ) : (
        <p className="settings-readonly">
          Members can view these settings. An owner or admin must change them.
        </p>
      )}
      <p className="platform-status" role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}

type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
};
type Invitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  state: string;
  expiresAt: string;
};

export function MemberManagement({
  workspaceId,
  currentUserId,
  currentRole,
  members,
  invitations,
}: {
  workspaceId: string;
  currentUserId: string;
  currentRole: WorkspaceRole;
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending("invite");
    setMessage("");
    try {
      await apiRequest(`/api/v1/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          role: data.get("role"),
        }),
      });
      form.reset();
      setMessage("Invitation sent.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not send the invitation.",
      );
    } finally {
      setPending(null);
    }
  }

  async function changeRole(memberId: string, role: WorkspaceRole) {
    setPending(memberId);
    setMessage("");
    try {
      await apiRequest(
        `/api/v1/workspaces/${workspaceId}/members/${memberId}`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not change the role.",
      );
    } finally {
      setPending(null);
    }
  }

  async function removeMember(memberId: string) {
    setPending(memberId);
    setMessage("");
    try {
      await apiRequest(
        `/api/v1/workspaces/${workspaceId}/members/${memberId}`,
        { method: "DELETE" },
      );
      if (
        members.find((member) => member.id === memberId)?.userId ===
        currentUserId
      ) {
        router.push("/app");
      } else router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not remove the member.",
      );
    } finally {
      setPending(null);
    }
  }

  async function revokeInvitation(invitationId: string) {
    setPending(invitationId);
    setMessage("");
    try {
      await apiRequest(
        `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`,
        { method: "DELETE" },
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not revoke the invitation.",
      );
    } finally {
      setPending(null);
    }
  }

  const canInvite = currentRole !== "member";
  return (
    <div className="member-management">
      {canInvite ? (
        <form className="invite-form" onSubmit={invite}>
          <label className="platform-field" htmlFor="invite-email">
            <span>Teammate email</span>
            <input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label className="platform-field" htmlFor="invite-role">
            <span>Starting role</span>
            <select id="invite-role" name="role" defaultValue="member">
              <option value="member">Member</option>
              {currentRole === "owner" ? (
                <option value="admin">Admin</option>
              ) : null}
            </select>
          </label>
          <button
            className="app-primary-button"
            type="submit"
            disabled={Boolean(pending)}
          >
            {pending === "invite" ? "Sending…" : "Invite teammate"}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      ) : (
        <p className="settings-readonly">
          Members can see the workspace directory but cannot invite or manage
          teammates.
        </p>
      )}
      <p className="platform-status" role="status" aria-live="polite">
        {message}
      </p>
      <div className="member-list" aria-label="Workspace members">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const ownerCanManage = currentRole === "owner";
          const adminCanRemove =
            currentRole === "admin" && member.role === "member";
          return (
            <div className="member-row" key={member.id}>
              <div>
                <strong>
                  {member.name}
                  {isSelf ? " (you)" : ""}
                </strong>
                <span>{member.email}</span>
              </div>
              <div className="member-actions">
                {ownerCanManage ? (
                  <select
                    aria-label={`Role for ${member.name}`}
                    value={member.role}
                    disabled={pending === member.id}
                    onChange={(event) =>
                      void changeRole(
                        member.id,
                        event.target.value as WorkspaceRole,
                      )
                    }
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span className="role-label">{member.role}</span>
                )}
                {ownerCanManage || adminCanRemove ? (
                  <button
                    className="app-text-button danger-button"
                    type="button"
                    disabled={pending === member.id}
                    onClick={() => void removeMember(member.id)}
                  >
                    {isSelf ? "Leave" : "Remove"}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {invitations.length ? (
        <section
          className="pending-invitations"
          aria-labelledby="pending-title"
        >
          <h3 id="pending-title">Pending invitations</h3>
          {invitations.map((invitation) => (
            <div className="member-row" key={invitation.id}>
              <div>
                <strong>{invitation.email}</strong>
                <span>
                  {invitation.role} · expires{" "}
                  {new Date(invitation.expiresAt).toLocaleDateString()}
                </span>
              </div>
              <button
                className="app-text-button danger-button"
                type="button"
                disabled={pending === invitation.id}
                onClick={() => void revokeInvitation(invitation.id)}
              >
                Revoke
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function InvitationAcceptance({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"working" | "auth" | "error">("working");
  const [message, setMessage] = useState("Securing your invitation…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function run() {
      try {
        const token = new URLSearchParams(window.location.hash.slice(1)).get(
          "token",
        );
        if (token) {
          await apiRequest("/api/v1/invitations/stage", {
            method: "POST",
            body: JSON.stringify({ token }),
          });
          history.replaceState(null, "", window.location.pathname);
        }
        if (!signedIn) {
          setState("auth");
          setMessage(
            "Sign in or create a verified account with the invited email address.",
          );
          return;
        }
        const accepted = await apiRequest<{ slug: string }>(
          "/api/v1/invitations/accept",
          { method: "POST" },
        );
        router.push(`/app/${accepted.slug}`);
        router.refresh();
      } catch (error) {
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "This invitation could not be accepted.",
        );
      }
    }
    void run();
  }, [router, signedIn]);

  return (
    <div className="invitation-state">
      <p
        className={`platform-status platform-status-${state === "error" ? "error" : "success"}`}
      >
        {message}
      </p>
      {state === "auth" ? (
        <div className="invitation-actions">
          <Link
            className="app-primary-button"
            href="/sign-in?callbackURL=%2Finvitations%2Faccept"
          >
            Sign in <span aria-hidden="true">↗</span>
          </Link>
          <Link
            className="app-secondary-link"
            href="/sign-up?callbackURL=%2Finvitations%2Faccept"
          >
            Create account
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function getTimeZones() {
  try {
    return Intl.supportedValuesOf("timeZone").includes("UTC")
      ? Intl.supportedValuesOf("timeZone")
      : ["UTC", ...Intl.supportedValuesOf("timeZone")];
  } catch {
    return ["UTC"];
  }
}
