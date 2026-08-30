import { notFound } from "next/navigation";

import { BacklogWorkspace } from "@/components/delivery-workspace";
import { workItemFilterSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import {
  listCycles,
  listMilestones,
  listDependencies,
  listProjectLabels,
  listProjectMembers,
  listWorkItems,
} from "@/server/delivery";
import { getRequestProject } from "@/server/request-context";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BacklogPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<SearchParams>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const raw = await searchParams;
  const scalar = Object.fromEntries(
    Object.entries(raw)
      .filter(([, value]) => typeof value === "string" && value !== "")
      .map(([key, value]) => [key, value]),
  );
  const data = await loadBacklog(workspaceSlug, projectKey, scalar);
  const { filters } = data;
  return (
    <BacklogWorkspace
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      items={data.result.items}
      pageInfo={data.result.pageInfo}
      members={data.members.members}
      milestones={data.milestones}
      cycles={data.cycles.items}
      labels={data.labels}
      dependencies={data.dependencies}
      filters={filters}
    />
  );
}

async function loadBacklog(
  workspaceSlug: string,
  projectKey: string,
  scalar: Record<string, string | string[] | undefined>,
) {
  try {
    const filters = parseInput(workItemFilterSchema, scalar);
    const { actor, workspace, project } = await getRequestProject(
      workspaceSlug,
      projectKey,
    );
    const [result, members, milestones, cycles, labels, dependencies] =
      await Promise.all([
        listWorkItems(actor, workspace.id, project.id, filters),
        listProjectMembers(actor, workspace.id, project.id),
        listMilestones(actor, workspace.id, project.id),
        listCycles(actor, workspace.id, project.id, {
          page: 1,
          pageSize: 100,
        }),
        listProjectLabels(actor, workspace.id, project.id),
        listDependencies(actor, workspace.id, project.id),
      ]);
    return {
      filters,
      workspace,
      project,
      result,
      members,
      milestones,
      cycles,
      labels,
      dependencies,
    };
  } catch {
    notFound();
  }
}
