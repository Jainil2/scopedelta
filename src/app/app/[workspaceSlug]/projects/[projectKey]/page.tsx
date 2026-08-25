import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectOverview } from "@/components/delivery-workspace";
import { requireSession } from "@/lib/session";
import {
  getProjectByKey,
  listMilestones,
  listProjectMembers,
} from "@/server/delivery";
import { getWorkspaceBySlug, listWorkspaceMembers } from "@/server/workspaces";

export default async function ProjectPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey } = await params;
  const data = await loadProject(actor, workspaceSlug, projectKey);
  return (
    <>
      <Link
        className="button button-light"
        href={`/app/${workspaceSlug}/projects/${data.project.key}/client`}
      >
        Client view
      </Link>
      <ProjectOverview
        workspaceId={data.workspace.id}
        workspaceSlug={workspaceSlug}
        project={data.project}
        milestones={data.milestones}
        projectMembers={data.projectDirectory.members}
        workspaceMembers={data.workspaceDirectory.members}
        workspaceMemberPageInfo={data.workspaceDirectory.memberPage}
        canManage={data.projectDirectory.canManage}
      />
    </>
  );
}

async function loadProject(
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
    const [milestones, projectDirectory, workspaceDirectory] =
      await Promise.all([
        listMilestones(actor, workspace.id, project.id),
        listProjectMembers(actor, workspace.id, project.id),
        listWorkspaceMembers(actor, workspace.id, {
          status: "active",
          pageSize: 25,
        }),
      ]);
    return {
      workspace,
      project,
      milestones,
      projectDirectory,
      workspaceDirectory,
    };
  } catch {
    notFound();
  }
}
