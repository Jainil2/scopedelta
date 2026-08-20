import { TimeEntryForm } from "@/components/operations-forms";
import {
  OperationsHeader,
  TimeLedger,
} from "@/components/operations-workspace";
import { timeEntryFiltersSchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listProjects } from "@/server/delivery";
import { listTimeEntries } from "@/server/operations";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function TimePage({
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
  const filters = parseInput(timeEntryFiltersSchema, raw);
  const [data, projectResult] = await Promise.all([
    listTimeEntries(actor, workspace.id, filters),
    listProjects(actor, workspace.id, 1, 100),
  ]);
  const projectOptions = projectResult.items
    .filter((project) => project.lifecycle === "active")
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
        active="time"
        description="Actual delivery evidence, separated into billable and non-billable minutes."
      />
      {projectOptions.length ? (
        <details className="operations-composer">
          <summary>Log delivery time</summary>
          <TimeEntryForm workspaceId={workspace.id} projects={projectOptions} />
        </details>
      ) : null}
      <form className="operations-filter" method="get">
        <label>
          From
          <input name="from" type="date" defaultValue={filters.from} />
        </label>
        <label>
          To
          <input name="to" type="date" defaultValue={filters.to} />
        </label>
        <label>
          Classification
          <select
            name="classification"
            defaultValue={filters.classification ?? ""}
          >
            <option value="">All actuals</option>
            <option value="billable">Billable</option>
            <option value="non_billable">Non-billable</option>
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      <TimeLedger data={data} />
    </div>
  );
}
