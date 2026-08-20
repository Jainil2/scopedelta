import {
  ExposureLedger,
  OperationsHeader,
} from "@/components/operations-workspace";
import { portfolioFiltersSchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listCommercialExposure } from "@/server/operations";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function ExposurePage({
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
  const filters = parseInput(portfolioFiltersSchema, raw);
  const data = await listCommercialExposure(actor, workspace.id, filters);
  return (
    <div className="app-content operations-page">
      <OperationsHeader
        workspaceName={workspace.name}
        workspaceSlug={workspaceSlug}
        active="exposure"
        description="Authoritative confirmed impact, unresolved exposure, and actual effort—without fabricated baseline value or margin."
      />
      <form className="operations-filter" method="get">
        <label>
          Search
          <input
            name="query"
            defaultValue={filters.query}
            placeholder="Project, key, or client"
          />
        </label>
        <label>
          Lifecycle
          <select name="lifecycle" defaultValue={filters.lifecycle}>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      <ExposureLedger data={data} />
    </div>
  );
}
