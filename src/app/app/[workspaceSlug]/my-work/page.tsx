import { notFound } from "next/navigation";

import { MyWorkWorkspace } from "@/components/planning-workspace";
import { myWorkFilterSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listMyWork, listMyWorkFacets } from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function MyWorkPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const data = await loadMyWork(actor, workspaceSlug, await searchParams);
  return (
    <MyWorkWorkspace
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      items={data.result.items}
      pageInfo={data.result.pageInfo}
      filters={data.filters}
      facets={data.facets}
    />
  );
}

async function loadMyWork(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const filters = parseInput(
      myWorkFilterSchema,
      Object.fromEntries(
        Object.entries(searchParams).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && entry[1] !== "",
        ),
      ),
    );
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const [result, facets] = await Promise.all([
      listMyWork(actor, workspace.id, filters),
      listMyWorkFacets(actor, workspace.id),
    ]);
    return { workspace, result, filters, facets };
  } catch {
    notFound();
  }
}
