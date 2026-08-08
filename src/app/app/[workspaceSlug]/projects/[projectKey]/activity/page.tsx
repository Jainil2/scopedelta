import { notFound } from "next/navigation";

import { ActivityWorkspace } from "@/components/collaboration-workspace";
import { requireSession } from "@/lib/session";
import { listActivity } from "@/server/collaboration";
import { getProjectByKey } from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function ProjectActivityPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey } = await params;
  const data = await loadActivity(actor, workspaceSlug, projectKey);
  return (
    <ActivityWorkspace
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
) {
  try {
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
    );
    const activity = await listActivity(actor, workspace.id, project.id, {
      page: 1,
      pageSize: 50,
    });
    return { project, activity };
  } catch {
    notFound();
  }
}
