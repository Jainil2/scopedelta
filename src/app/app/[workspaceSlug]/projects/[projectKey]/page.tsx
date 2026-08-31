import { notFound } from "next/navigation";

import { ProjectOverview } from "@/components/delivery-workspace";
import { getProjectCommandCenter } from "@/server/project-command-center";
import { getRequestProject } from "@/server/request-context";

export default async function ProjectPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const data = await loadProject(workspaceSlug, projectKey);
  return (
    <ProjectOverview
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      milestones={data.commandCenter.milestones}
      cycles={data.commandCenter.cycles}
      attention={data.commandCenter.attention}
      commercial={data.commandCenter.commercial}
      projectMembers={data.commandCenter.projectDirectory.members}
      workspaceMembers={data.commandCenter.workspaceDirectory.members}
      workspaceMemberPageInfo={data.commandCenter.workspaceDirectory.memberPage}
      canManage={data.commandCenter.canManage}
    />
  );
}

async function loadProject(workspaceSlug: string, projectKey: string) {
  try {
    const { actor, workspace, project } = await getRequestProject(
      workspaceSlug,
      projectKey,
    );
    const commandCenter = await getProjectCommandCenter(
      actor,
      workspace,
      project,
    );
    return {
      actor,
      workspace,
      project,
      commandCenter,
    };
  } catch {
    notFound();
  }
}
