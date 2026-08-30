import { notFound } from "next/navigation";

import { MyWorkWorkspace } from "@/components/planning-workspace";
import { myWorkFilterSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { listMyWork, listMyWorkFacets } from "@/server/delivery";
import {
  getRequestIdentity,
  getRequestWorkspace,
} from "@/server/request-context";

export default async function MyWorkPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { workspaceSlug } = await params;
  const data = await loadMyWork(workspaceSlug, await searchParams);
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
    const [{ actor }, workspace] = await Promise.all([
      getRequestIdentity(),
      getRequestWorkspace(workspaceSlug),
    ]);
    const [result, facets] = await Promise.all([
      listMyWork(actor, workspace.id, filters),
      listMyWorkFacets(actor, workspace.id),
    ]);
    return { workspace, result, filters, facets };
  } catch {
    notFound();
  }
}
