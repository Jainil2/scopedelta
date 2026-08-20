"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; name: string; key?: string };

async function mutate(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error?.message ?? "The change could not be saved.");
}

export function TimeEntryForm({
  workspaceId,
  projects,
  initialProjectId,
  initialWorkItemId,
  defaultWorkDate,
}: Readonly<{
  workspaceId: string;
  projects: Option[];
  initialProjectId?: string;
  initialWorkItemId?: string;
  defaultWorkDate: string;
}>) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  return (
    <form
      className="operations-mutation"
      onSubmit={async (event) => {
        event.preventDefault();
        setStatus("Saving…");
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
          await mutate(`/api/v1/workspaces/${workspaceId}/time-entries`, {
            projectId: form.get("projectId"),
            workItemId: initialWorkItemId ?? null,
            workDate: form.get("workDate"),
            durationMinutes: Number(form.get("durationMinutes")),
            classification: form.get("classification"),
            note: form.get("note"),
          });
          formElement.reset();
          setStatus("Logged.");
          router.refresh();
        } catch (error) {
          setStatus(
            error instanceof Error ? error.message : "Unable to log time.",
          );
        }
      }}
    >
      <label>
        Project
        <select name="projectId" defaultValue={initialProjectId} required>
          {projects.map((project) => (
            <option value={project.id} key={project.id}>
              {project.key ? `${project.key} · ` : ""}
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Work date
        <input
          name="workDate"
          type="date"
          defaultValue={defaultWorkDate}
          required
        />
      </label>
      <label>
        Actual minutes
        <input
          name="durationMinutes"
          type="number"
          min="1"
          max="1440"
          defaultValue="60"
          required
        />
      </label>
      <label>
        Classification
        <select name="classification" defaultValue="billable">
          <option value="billable">Billable</option>
          <option value="non_billable">Non-billable</option>
        </select>
      </label>
      <label className="operations-note">
        Note
        <input
          name="note"
          maxLength={500}
          placeholder="Optional audit context"
        />
      </label>
      <button type="submit">Log time</button>
      <output aria-live="polite">{status}</output>
    </form>
  );
}

export function AvailabilityForm({
  workspaceId,
  members,
  currentWeek,
}: Readonly<{ workspaceId: string; members: Option[]; currentWeek: string }>) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  return (
    <form
      className="operations-mutation compact"
      onSubmit={async (event) => {
        event.preventDefault();
        setStatus("Saving…");
        const form = new FormData(event.currentTarget);
        const memberId = String(form.get("memberId") ?? "");
        const url = memberId
          ? `/api/v1/workspaces/${workspaceId}/capacity/members/${memberId}/availability`
          : `/api/v1/workspaces/${workspaceId}/capacity/availability`;
        try {
          await mutate(url, {
            weeklyMinutes: Number(form.get("weeklyMinutes")),
            effectiveFrom: form.get("effectiveFrom"),
          });
          setStatus("Availability scheduled.");
          router.refresh();
        } catch (error) {
          setStatus(
            error instanceof Error
              ? error.message
              : "Unable to save availability.",
          );
        }
      }}
    >
      <label>
        Applies to
        <select name="memberId">
          <option value="">Workspace default</option>
          {members.map((member) => (
            <option value={member.id} key={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Minutes / week
        <input
          name="weeklyMinutes"
          type="number"
          min="0"
          max="10080"
          defaultValue="2400"
          required
        />
      </label>
      <label>
        Effective Monday
        <input
          name="effectiveFrom"
          type="date"
          defaultValue={currentWeek}
          required
        />
      </label>
      <button type="submit">Set availability</button>
      <output aria-live="polite">{status}</output>
    </form>
  );
}

export function AllocationForm({
  workspaceId,
  members,
  projects,
  currentWeek,
}: Readonly<{
  workspaceId: string;
  members: Option[];
  projects: Option[];
  currentWeek: string;
}>) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  return (
    <form
      className="operations-mutation"
      onSubmit={async (event) => {
        event.preventDefault();
        setStatus("Saving…");
        const form = new FormData(event.currentTarget);
        try {
          await mutate(`/api/v1/workspaces/${workspaceId}/allocations`, {
            memberUserId: form.get("memberUserId"),
            projectId: form.get("projectId"),
            startWeek: form.get("startWeek"),
            endWeek: form.get("endWeek"),
            plannedMinutesPerWeek: Number(form.get("plannedMinutesPerWeek")),
            roleLabel: form.get("roleLabel"),
          });
          setStatus("Allocation added.");
          router.refresh();
        } catch (error) {
          setStatus(
            error instanceof Error
              ? error.message
              : "Unable to add allocation.",
          );
        }
      }}
    >
      <label>
        Person
        <select name="memberUserId" required>
          {members.map((member) => (
            <option value={member.id} key={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project
        <select name="projectId" required>
          {projects.map((project) => (
            <option value={project.id} key={project.id}>
              {project.key} · {project.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start Monday
        <input
          name="startWeek"
          type="date"
          defaultValue={currentWeek}
          required
        />
      </label>
      <label>
        End Monday
        <input name="endWeek" type="date" defaultValue={currentWeek} required />
      </label>
      <label>
        Minutes / week
        <input
          name="plannedMinutesPerWeek"
          type="number"
          min="1"
          max="10080"
          defaultValue="1200"
          required
        />
      </label>
      <label>
        Role label
        <input name="roleLabel" maxLength={80} placeholder="Optional" />
      </label>
      <button type="submit">Add allocation</button>
      <output aria-live="polite">{status}</output>
    </form>
  );
}
