import { notFound } from "next/navigation";

import { BacklogWorkspace } from "@/components/delivery-workspace";
import { workItemFilterSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import {
  getProjectByKey,
  listMilestones,
  listDependencies,
  listProjectLabels,
  listProjectMembers,
  listWorkItems,
} from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BacklogPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<SearchParams>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey } = await params;
  const raw = await searchParams;
  const scalar = Object.fromEntries(
    Object.entries(raw)
      .filter(([, value]) => typeof value === "string" && value !== "")
      .map(([key, value]) => [key, value]),
  );
  const data = await loadBacklog(actor, workspaceSlug, projectKey, scalar);
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
      labels={data.labels}
      dependencies={data.dependencies}
      filtered={Boolean(
        filters.status ||
        filters.priority ||
        filters.assigneeUserId ||
        filters.milestoneId ||
        filters.labelId,
      )}
    />
  );
}

async function loadBacklog(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  projectKey: string,
  scalar: Record<string, string | string[] | undefined>,
) {
  try {
    const filters = parseInput(workItemFilterSchema, scalar);
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
    );
    const [result, members, milestones, labels, dependencies] =
      await Promise.all([
        listWorkItems(actor, workspace.id, project.id, filters),
        listProjectMembers(actor, workspace.id, project.id),
        listMilestones(actor, workspace.id, project.id),
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
      labels,
      dependencies,
    };
  } catch {
    notFound();
  }
}
