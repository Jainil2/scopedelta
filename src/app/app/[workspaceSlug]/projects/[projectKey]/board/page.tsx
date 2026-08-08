import { notFound } from "next/navigation";

import { BoardWorkspace } from "@/components/planning-workspace";
import { workItemFilterSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import {
  getProjectByKey,
  listCycles,
  listMilestones,
  listProjectLabels,
  listProjectMembers,
  listWorkItems,
} from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BoardPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<SearchParams>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey } = await params;
  const scalar = scalarSearch(await searchParams);
  const data = await loadBoard(actor, workspaceSlug, projectKey, scalar);
  return (
    <BoardWorkspace
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      items={data.result.items}
      pageInfo={data.result.pageInfo}
      members={data.members.members}
      milestones={data.milestones}
      cycles={data.cycles.items}
      labels={data.labels}
      filters={data.filters}
    />
  );
}

async function loadBoard(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  projectKey: string,
  scalar: Record<string, string>,
) {
  try {
    const filters = parseInput(workItemFilterSchema, {
      ...scalar,
      pageSize: scalar.pageSize || 100,
    });
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
    );
    const [result, members, milestones, cycles, labels] = await Promise.all([
      listWorkItems(actor, workspace.id, project.id, filters),
      listProjectMembers(actor, workspace.id, project.id),
      listMilestones(actor, workspace.id, project.id),
      listCycles(actor, workspace.id, project.id, { page: 1, pageSize: 100 }),
      listProjectLabels(actor, workspace.id, project.id),
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
    };
  } catch {
    notFound();
  }
}

function scalarSearch(raw: SearchParams) {
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
}
