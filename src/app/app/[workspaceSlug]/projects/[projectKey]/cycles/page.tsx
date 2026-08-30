import { notFound } from "next/navigation";

import { CyclesWorkspace } from "@/components/planning-workspace";
import { cycleFilterSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { listCycles } from "@/server/delivery";
import { getRequestProject } from "@/server/request-context";

export default async function CyclesPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const data = await loadCycles(workspaceSlug, projectKey, await searchParams);
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
  workspaceSlug: string,
  projectKey: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const filters = parseInput(cycleFilterSchema, {
      page: scalar(searchParams.page),
      lifecycle: scalar(searchParams.lifecycle),
    });
    const { actor, workspace, project } = await getRequestProject(
      workspaceSlug,
      projectKey,
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
