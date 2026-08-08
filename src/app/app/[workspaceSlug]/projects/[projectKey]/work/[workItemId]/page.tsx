import { notFound } from "next/navigation";

import { WorkCollaborationWorkspace } from "@/components/collaboration-workspace";
import { requireSession } from "@/lib/session";
import {
  getSubscription,
  listActivity,
  listComments,
  listMentionableMembers,
} from "@/server/collaboration";
import { getProjectByKey, getWorkItem } from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function WorkCollaborationPage({
  params,
}: Readonly<{
  params: Promise<{
    workspaceSlug: string;
    projectKey: string;
    workItemId: string;
  }>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey, workItemId } = await params;
  const data = await loadWorkCollaboration(
    actor,
    workspaceSlug,
    projectKey,
    workItemId,
  );
  return (
    <WorkCollaborationWorkspace
      actorUserId={actor.userId}
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      workItem={data.workItem}
      initialComments={data.comments.data}
      activities={data.activity.data}
      members={data.members.data}
      initialWatching={data.subscription.watching}
    />
  );
}

async function loadWorkCollaboration(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  projectKey: string,
  workItemId: string,
) {
  try {
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
    );
    const [workItem, comments, activity, members, subscription] =
      await Promise.all([
        getWorkItem(actor, workspace.id, project.id, workItemId),
        listComments(actor, workspace.id, project.id, workItemId, 1, 100),
        listActivity(
          actor,
          workspace.id,
          project.id,
          { page: 1, pageSize: 50 },
          workItemId,
        ),
        listMentionableMembers(actor, workspace.id, project.id),
        getSubscription(actor, workspace.id, project.id, workItemId),
      ]);
    return {
      workspace,
      project,
      workItem,
      comments,
      activity,
      members,
      subscription,
    };
  } catch {
    notFound();
  }
}
