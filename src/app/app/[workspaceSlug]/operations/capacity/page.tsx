import {
  AllocationForm,
  AvailabilityForm,
} from "@/components/operations-forms";
import {
  CapacityLedger,
  OperationsHeader,
} from "@/components/operations-workspace";
import { capacityFiltersSchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listProjects } from "@/server/delivery";
import { listCapacity } from "@/server/operations";
import { getWorkspaceBySlug, listWorkspaceMembers } from "@/server/workspaces";

export default async function CapacityPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const filters = parseInput(capacityFiltersSchema, raw);
  const [data, directory, projectResult] = await Promise.all([
    listCapacity(actor, workspace.id, filters),
    listWorkspaceMembers(actor, workspace.id),
    listProjects(actor, workspace.id, 1, 100),
  ]);
  const memberOptions = directory.members.map((member) => ({
    id: member.userId,
    name: member.name,
  }));
  const projectOptions = projectResult.items
    .filter(
      (project) =>
        workspace.role !== "member" || project.leadUserId === actor.userId,
    )
    .map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
    }));
  return (
    <div className="app-content operations-page">
      <OperationsHeader
        workspaceName={workspace.name}
        workspaceSlug={workspaceSlug}
        active="capacity"
        description="Availability, planned allocation, and delivery actuals remain separate weekly facts."
      />
      <form className="operations-filter" method="get">
        <label>
          Start Monday
          <input name="startWeek" type="date" defaultValue={data.startWeek} />
        </label>
        <label>
          Weeks
          <select name="weeks" defaultValue={filters.weeks}>
            {[4, 8, 12, 16, 26].map((weeks) => (
              <option key={weeks}>{weeks}</option>
            ))}
          </select>
        </label>
        <label>
          Person
          <input name="query" defaultValue={filters.query} placeholder="Name" />
        </label>
        <button type="submit">Apply</button>
      </form>
      {data.canManageAvailability ? (
        <details className="operations-composer">
          <summary>Schedule availability</summary>
          <AvailabilityForm
            workspaceId={workspace.id}
            members={memberOptions}
            currentWeek={data.startWeek}
          />
        </details>
      ) : null}
      {projectOptions.length ? (
        <details className="operations-composer">
          <summary>Add planned allocation</summary>
          <AllocationForm
            workspaceId={workspace.id}
            members={memberOptions}
            projects={projectOptions}
            currentWeek={data.startWeek}
          />
        </details>
      ) : null}
      <CapacityLedger data={data} />
    </div>
  );
}
