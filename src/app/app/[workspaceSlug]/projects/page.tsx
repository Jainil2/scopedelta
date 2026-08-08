import { notFound } from "next/navigation";

import { ProjectDirectory } from "@/components/delivery-workspace";
import { requireSession } from "@/lib/session";
import { listClients, listProjects } from "@/server/delivery";
import { getWorkspaceBySlug, listWorkspaceMembers } from "@/server/workspaces";

export default async function ProjectsPage({
  params,
}: Readonly<{ params: Promise<{ workspaceSlug: string }> }>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const data = await loadProjects(actor, workspaceSlug);
  return (
    <ProjectDirectory
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      clients={data.clientResult.items}
      members={data.directory.members}
      projects={data.projectResult.items}
    />
  );
}

async function loadProjects(
  actor: { userId: string; email: string },
  workspaceSlug: string,
) {
  try {
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const [clientResult, projectResult, directory] = await Promise.all([
      listClients(actor, workspace.id, 1, 100),
      listProjects(actor, workspace.id, 1, 100),
      listWorkspaceMembers(actor, workspace.id),
    ]);
    return { workspace, clientResult, projectResult, directory };
  } catch {
    notFound();
  }
}
