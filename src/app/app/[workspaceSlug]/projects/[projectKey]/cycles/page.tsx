import { notFound } from "next/navigation";

import { CyclesWorkspace } from "@/components/planning-workspace";
import { cycleFilterSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { getProjectByKey, listCycles } from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function CyclesPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey } = await params;
  const data = await loadCycles(
    actor,
    workspaceSlug,
    projectKey,
    await searchParams,
  );
  return (
    <CyclesWorkspace
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      cycles={data.result.items}
      pageInfo={data.result.pageInfo}
      lifecycle={data.filters.lifecycle}
    />
  );
}

async function loadCycles(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  projectKey: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const filters = parseInput(cycleFilterSchema, {
      page: scalar(searchParams.page),
      lifecycle: scalar(searchParams.lifecycle),
    });
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
    );
    const result = await listCycles(actor, workspace.id, project.id, filters);
    return { workspace, project, result, filters };
  } catch {
    notFound();
  }
}

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" && value ? value : undefined;
}
