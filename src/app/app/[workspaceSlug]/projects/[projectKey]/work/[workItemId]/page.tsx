import { notFound } from "next/navigation";

import { WorkCollaborationWorkspace } from "@/components/collaboration-workspace";
import { WorkCommercialPanel } from "@/components/commercial-workspace";
import { WorkEngineeringPanel } from "@/components/engineering-workspace";
import { TimeEntryForm } from "@/components/operations-forms";
import { paginationSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import {
  getSubscription,
  listActivity,
  listComments,
  listMentionableMembers,
} from "@/server/collaboration";
import {
  getWorkCommercialProvenance,
  listCommercialBasisOptions,
} from "@/server/commercial";
import { getProjectByKey, getWorkItem } from "@/server/delivery";
import { getDeliveryEvidenceTrace } from "@/server/engineering-delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

type SearchParamValue = string | string[] | undefined;

export default async function WorkCollaborationPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{
    workspaceSlug: string;
    projectKey: string;
    workItemId: string;
  }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey, workItemId } = await params;
  const data = await loadWorkCollaboration(
    actor,
    workspaceSlug,
    projectKey,
    workItemId,
    await searchParams,
  );
  return (
    <WorkCollaborationWorkspace
      key={`${data.comments.page.number}:${data.activity.page.number}`}
      actorUserId={actor.userId}
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      workItem={data.workItem}
      initialComments={data.comments.data}
      commentPage={data.comments.page}
      activities={data.activity.data}
      activityPage={data.activity.page}
      members={data.members.data}
      initialWatching={data.subscription.watching}
      commercialPanel={
        <WorkCommercialPanel
          key="commercial-provenance"
          workspaceId={data.workspace.id}
          projectId={data.project.id}
          provenance={data.provenance}
          options={data.basisOptions}
          canManage={data.canManageCommercial}
        />
      }
      engineeringPanel={
        <WorkEngineeringPanel
          trace={data.engineeringTrace}
          aiHref={`/app/${workspaceSlug}/projects/${data.project.key}/ai?kind=work_context_qa_pack&workItemId=${data.workItem.id}`}
        />
      }
      operationsPanel={
        data.project.lifecycle === "active" ? (
          <details className="operations-composer work-time-composer">
            <summary>Log time against this work item</summary>
            <TimeEntryForm
              workspaceId={data.workspace.id}
              projects={[
                {
                  id: data.project.id,
                  key: data.project.key,
                  name: data.project.name,
                },
              ]}
              initialProjectId={data.project.id}
              initialWorkItemId={data.workItem.id}
            />
          </details>
        ) : null
      }
    />
  );
}

async function loadWorkCollaboration(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  projectKey: string,
  workItemId: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const commentPagination = parseInput(paginationSchema, {
      page: scalar(searchParams.commentPage),
      pageSize: 100,
    });
    const activityPagination = parseInput(paginationSchema, {
      page: scalar(searchParams.activityPage),
      pageSize: 50,
    });
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
    );
    const canManageCommercial =
      workspace.role !== "member" || project.leadUserId === actor.userId;
    const [
      workItem,
      comments,
      activity,
      members,
      subscription,
      provenance,
      basisOptions,
      engineeringTrace,
    ] = await Promise.all([
      getWorkItem(actor, workspace.id, project.id, workItemId),
      listComments(
        actor,
        workspace.id,
        project.id,
        workItemId,
        commentPagination.page,
        commentPagination.pageSize,
      ),
      listActivity(
        actor,
        workspace.id,
        project.id,
        activityPagination,
        workItemId,
      ),
      listMentionableMembers(actor, workspace.id, project.id),
      getSubscription(actor, workspace.id, project.id, workItemId),
      getWorkCommercialProvenance(actor, workspace.id, project.id, workItemId),
      canManageCommercial
        ? listCommercialBasisOptions(actor, workspace.id, project.id)
        : Promise.resolve([]),
      getDeliveryEvidenceTrace(actor, workspace.id, project.id, workItemId),
    ]);
    return {
      workspace,
      project,
      workItem,
      comments,
      activity,
      members,
      subscription,
      provenance,
      basisOptions,
      engineeringTrace,
      canManageCommercial,
    };
  } catch {
    notFound();
  }
}

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
