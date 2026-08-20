import {
  OperationsHeader,
  PortfolioLedger,
} from "@/components/operations-workspace";
import { PORTFOLIO_ATTENTION_CATEGORIES } from "@/lib/operations";
import { portfolioFiltersSchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listPortfolio } from "@/server/operations";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function PortfolioPage({
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
  const raw = await searchParams;
  const filters = parseInput(portfolioFiltersSchema, singleValues(raw));
  const data = await listPortfolio(actor, workspace.id, filters);
  return (
    <div className="app-content operations-page">
      <OperationsHeader
        workspaceName={workspace.name}
        workspaceSlug={workspaceSlug}
        active="portfolio"
        description="Projects ordered for action, with every signal linked to its source evidence."
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
        <label>
          Attention
          <select name="attention" defaultValue={filters.attention ?? ""}>
            <option value="">Any signal</option>
            {PORTFOLIO_ATTENTION_CATEGORIES.map((category) => (
              <option value={category} key={category}>
                {category.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      <PortfolioLedger data={data} workspaceSlug={workspaceSlug} />
    </div>
  );
}

function singleValues(values: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}
