import { notFound } from "next/navigation";

import { EngineeringWorkspace } from "@/components/engineering-workspace";
import { engineeringCoverageFiltersSchema } from "@/lib/engineering-validation";
import { parseInput } from "@/lib/platform-validation";
import {
  getEngineeringCoverage,
  listEngineeringWorkspace,
} from "@/server/engineering-delivery";
import { getRequestProject } from "@/server/request-context";

export default async function EngineeringPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const query = await searchParams;
  const data = await loadEngineering(workspaceSlug, projectKey, query);
  return (
    <EngineeringWorkspace
      key={`${data.coverage.page.number}:${data.engineering.artifacts.length}:${data.engineering.verifications.length}:${data.engineering.defects.length}`}
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      engineering={data.engineering}
      coverage={data.coverage}
    />
  );
}

async function loadEngineering(
  workspaceSlug: string,
  projectKey: string,
  query: Record<string, string | string[] | undefined>,
) {
  try {
    const { actor, workspace, project } = await getRequestProject(
      workspaceSlug,
      projectKey,
    );
    const filters = parseInput(engineeringCoverageFiltersSchema, {
      page: typeof query.page === "string" ? query.page : undefined,
      pageSize: 50,
      milestoneId:
        typeof query.milestoneId === "string" ? query.milestoneId : undefined,
    });
    const [engineering, coverage] = await Promise.all([
      listEngineeringWorkspace(actor, workspace.id, project.id),
      getEngineeringCoverage(actor, workspace.id, project.id, filters),
    ]);
    return { workspace, project, engineering, coverage };
  } catch {
    notFound();
  }
}
