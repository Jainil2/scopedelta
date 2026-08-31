import { notFound } from "next/navigation";

import { ActivityWorkspace } from "@/components/collaboration-workspace";
import { paginationSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { listActivity } from "@/server/collaboration";
import { getRequestProject } from "@/server/request-context";

export default async function ProjectActivityPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const data = await loadActivity(
    workspaceSlug,
    projectKey,
    await searchParams,
  );
  return (
    <ActivityWorkspace
      key={data.activity.page.number}
      workspaceSlug={workspaceSlug}
      project={data.project}
      activities={data.activity.data}
      page={data.activity.page}
    />
  );
}

async function loadActivity(
  workspaceSlug: string,
  projectKey: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const pagination = parseInput(paginationSchema, {
      page:
        typeof searchParams.page === "string" ? searchParams.page : undefined,
      pageSize: 50,
    });
    const { actor, workspace, project } = await getRequestProject(
      workspaceSlug,
      projectKey,
    );
    const activity = await listActivity(
      actor,
      workspace.id,
      project.id,
      pagination,
    );
    return { project, activity };
  } catch {
    notFound();
  }
}
