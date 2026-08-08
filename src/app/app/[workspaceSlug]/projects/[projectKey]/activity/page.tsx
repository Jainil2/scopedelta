import { notFound } from "next/navigation";

import { ActivityWorkspace } from "@/components/collaboration-workspace";
import { paginationSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listActivity } from "@/server/collaboration";
import { getProjectByKey } from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function ProjectActivityPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey } = await params;
  const data = await loadActivity(
    actor,
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
  actor: { userId: string; email: string },
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
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
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
