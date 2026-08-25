"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import type {
  WorkspaceOnboarding,
  WorkspaceOnboardingStep,
} from "@/server/self-service";

type ApiResult<T> = { data: T } | { error: { message: string } };

async function mutate<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: init.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init.headers,
  });
  const result = (await response.json()) as ApiResult<T>;
  if (!response.ok || "error" in result) {
    throw new Error(
      "error" in result ? result.error.message : "The request failed.",
    );
  }
  return result.data;
}

export function GettingStartedWorkspace({
  workspaceId,
  onboarding,
}: Readonly<{ workspaceId: string; onboarding: WorkspaceOnboarding }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function setDismissed(dismissed: boolean) {
    setPending(true);
    setMessage("");
    try {
      await mutate(`/api/v1/workspaces/${workspaceId}/onboarding`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed }),
      });
      setMessage(
        dismissed
          ? "Checklist dismissed. You can resume it here."
          : "Checklist resumed.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update the checklist.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="self-service-stack">
      <section
        className="settings-section onboarding-summary"
        aria-labelledby="activation-title"
      >
        <div>
          <p className="app-eyebrow">Authoritative activation</p>
          <h2 id="activation-title">
            {onboarding.completedRequired} of {onboarding.requiredCount} core
            steps complete
          </h2>
          <p>
            Progress comes from current workspace records. Dismissing this view
            never marks product work complete.
          </p>
        </div>
        <button
          className="app-secondary-button"
          type="button"
          disabled={pending}
          onClick={() => void setDismissed(!onboarding.dismissed)}
        >
          {onboarding.dismissed ? "Resume checklist" : "Dismiss checklist"}
        </button>
      </section>
      <div className="onboarding-ledger">
        {onboarding.steps.map((step) => (
          <OnboardingRow key={step.id} step={step} />
        ))}
      </div>
      <output className="platform-status" aria-live="polite">
        {message}
      </output>
    </div>
  );
}

function OnboardingRow({ step }: Readonly<{ step: WorkspaceOnboardingStep }>) {
  return (
    <article className={`onboarding-row onboarding-row-${step.status}`}>
      <div>
        <span className="role-label">
          {step.status === "complete"
            ? "Complete"
            : step.status === "blocked"
              ? "Blocked"
              : "Next"}
        </span>
        <h3>{step.label}</h3>
        <p>{step.description}</p>
        {step.prerequisite ? <small>{step.prerequisite}</small> : null}
      </div>
      <div className="member-actions">
        <span>{step.required ? "Core" : "Recommended"}</span>
        {step.status !== "complete" ? (
          <Link className="app-secondary-link" href={step.href}>
            Open action
          </Link>
        ) : null}
      </div>
    </article>
  );
}

type LifecycleRequest = {
  id: string;
  intent: "closure" | "deletion";
  state: "requested" | "canceled";
  requestedAt: string | Date;
};

export function WorkspaceLifecyclePanel({
  workspaceId,
  workspaceSlug,
  requests,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  requests: readonly LifecycleRequest[];
}>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const open = requests.find((request) => request.state === "requested");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      await mutate(`/api/v1/workspaces/${workspaceId}/lifecycle-requests`, {
        method: "POST",
        body: JSON.stringify({
          intent: data.get("intent"),
          confirmation: data.get("confirmation"),
          exportAcknowledged: data.get("exportAcknowledged") === "on",
          retentionAcknowledged: data.get("retentionAcknowledged") === "on",
        }),
      });
      setMessage("Lifecycle request recorded. No workspace data was deleted.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not record the request.",
      );
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    if (!open || pending) return;
    setPending(true);
    try {
      await mutate(
        `/api/v1/workspaces/${workspaceId}/lifecycle-requests/${open.id}`,
        { method: "DELETE" },
      );
      setMessage("Lifecycle request canceled.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not cancel the request.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="settings-section lifecycle-section"
      aria-labelledby="lifecycle-title"
    >
      <p className="app-eyebrow">Workspace lifecycle</p>
      <h2 id="lifecycle-title">Request closure or deletion review</h2>
      <p>
        This records an operator-inspectable request only. Audit and client
        acceptance history remain preserved until Layer 8 defines retention and
        physical deletion policy.
      </p>
      <p>
        <a href={`/api/v1/workspaces/${workspaceId}/exports/delivery-core`}>
          Export core delivery data first
        </a>
      </p>
      {open ? (
        <div className="actionable-empty-state">
          <strong>{open.intent} requested</strong>
          <p>
            No destructive action has occurred. You may cancel this request.
          </p>
          <button
            className="app-secondary-button"
            type="button"
            disabled={pending}
            onClick={() => void cancel()}
          >
            Cancel request
          </button>
        </div>
      ) : (
        <form className="platform-form" onSubmit={submit}>
          <label className="platform-field">
            <span>Request type</span>
            <select name="intent" defaultValue="closure">
              <option value="closure">Closure review</option>
              <option value="deletion">Deletion review</option>
            </select>
          </label>
          <label className="platform-field">
            <span>Type the workspace slug to confirm: {workspaceSlug}</span>
            <input name="confirmation" required autoComplete="off" />
          </label>
          <label>
            <input type="checkbox" name="exportAcknowledged" required /> I
            reviewed the available export path.
          </label>
          <label>
            <input type="checkbox" name="retentionAcknowledged" required /> I
            understand records remain until an approved retention policy permits
            deletion.
          </label>
          <button
            className="danger-button app-secondary-button"
            type="submit"
            disabled={pending}
          >
            {pending ? "Recording…" : "Record lifecycle request"}
          </button>
        </form>
      )}
      <output className="platform-status" aria-live="polite">
        {message}
      </output>
    </section>
  );
}

export function ActionableEmptyState({
  title,
  why,
  next,
  href,
  prerequisite,
}: Readonly<{
  title: string;
  why: string;
  next: string;
  href: string;
  prerequisite?: string;
}>) {
  return (
    <div className="actionable-empty-state">
      <h3>{title}</h3>
      <p>{why}</p>
      {prerequisite ? <small>{prerequisite}</small> : null}
      <Link className="app-secondary-link" href={href}>
        {next}
      </Link>
    </div>
  );
}
