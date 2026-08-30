import { notFound } from "next/navigation";

import { ClientCollaborationWorkspace } from "@/components/client-collaboration-workspace";
import {
  getClientProjectPreview,
  listClientParticipants,
} from "@/server/client-collaboration";
import { listCommercialRequests } from "@/server/commercial-change-control";
import { listMilestones } from "@/server/delivery";
import { getRequestProject } from "@/server/request-context";

export default async function InternalClientCollaborationPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const pageData = await (async () => {
    const { actor, workspace, project } = await getRequestProject(
      workspaceSlug,
      projectKey,
    );
    const [preview, directory, milestones, ledger] = await Promise.all([
      getClientProjectPreview(actor, workspace.id, project.id),
      listClientParticipants(actor, workspace.id, project.id),
      listMilestones(actor, workspace.id, project.id),
      listCommercialRequests(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 100,
      }),
    ]);
    return { workspace, project, preview, directory, milestones, ledger };
  })().catch(() => notFound());

  return (
    <ClientCollaborationWorkspace
      workspaceId={pageData.workspace.id}
      workspaceSlug={workspaceSlug}
      project={{
        id: pageData.project.id,
        key: pageData.project.key,
        name: pageData.project.name,
      }}
      preview={pageData.preview}
      participants={pageData.directory.participants}
      invitations={pageData.directory.invitations}
      milestones={pageData.milestones.map(({ id, name }) => ({ id, name }))}
      requests={pageData.ledger.data.map((request) => ({
        id: request.id,
        title: request.title,
        state: request.state,
        decision: request.currentDecision
          ? {
              id: request.currentDecision.id,
              disposition: request.currentDecision.disposition,
            }
          : null,
        impacts: request.impacts.map((impact) => ({
          id: impact.id,
          decisionId: impact.decisionId,
          confidence: impact.confidence,
          scheduleDeltaDays: impact.scheduleDeltaDays,
          targetDate: impact.targetDate,
          monetaryAmount: impact.monetaryAmount,
          currencyCode: impact.currencyCode,
        })),
      }))}
    />
  );
}
