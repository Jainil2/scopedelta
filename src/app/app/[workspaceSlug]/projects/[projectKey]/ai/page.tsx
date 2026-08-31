import { notFound } from "next/navigation";

import { AiDeliveryWorkspace } from "@/components/ai-delivery-workspace";
import { listAiJobs } from "@/server/ai/jobs";
import { listCommercialRequests } from "@/server/commercial-change-control";
import { listMilestones, listWorkItems } from "@/server/delivery";
import { getRequestProject } from "@/server/request-context";

export default async function AiDeliveryPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const query = await searchParams;
  let pageData;
  try {
    const { actor, workspace, project } = await getRequestProject(
      workspaceSlug,
      projectKey,
    );
    const [jobs, milestones, work, requests] = await Promise.all([
      listAiJobs(actor, workspace.id, project.id),
      listMilestones(actor, workspace.id, project.id),
      listWorkItems(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 100,
      }),
      listCommercialRequests(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
      }).catch(() => ({ data: [] })),
    ]);
    pageData = { workspace, project, jobs, milestones, work, requests };
  } catch {
    notFound();
  }
  return (
    <AiDeliveryWorkspace
      workspaceId={pageData.workspace.id}
      workspaceSlug={workspaceSlug}
      project={pageData.project}
      initialJobs={pageData.jobs}
      requests={pageData.requests.data.map((request) => ({
        id: request.id,
        title: request.title,
        state: request.state,
      }))}
      milestones={pageData.milestones.map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
        status: milestone.status,
      }))}
      workItems={pageData.work.items.map((item) => ({
        id: item.id,
        identifier: item.identifier,
        title: item.title,
        status: item.status,
      }))}
      initialTarget={{
        kind: scalar(query.kind),
        requestId: scalar(query.requestId),
        milestoneId: scalar(query.milestoneId),
        workItemId: scalar(query.workItemId),
      }}
    />
  );
}

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
