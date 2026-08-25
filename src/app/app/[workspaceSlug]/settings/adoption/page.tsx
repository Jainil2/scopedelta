import { notFound } from "next/navigation";

import { AdoptionWorkspace } from "@/components/adoption-workspace";
import { requireSession } from "@/lib/session";
import { listImportSessions, listProjectTemplates } from "@/server/adoption";
import { listClients, listProjects } from "@/server/delivery";
import { getWorkspaceBySlug, listWorkspaceMembers } from "@/server/workspaces";

export default async function AdoptionPage({
  params,
}: Readonly<{ params: Promise<{ workspaceSlug: string }> }>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const data = await (async () => {
    try {
      const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
      if (workspace.role === "member") notFound();
      const [templates, imports, clients, projects, directory] =
        await Promise.all([
          listProjectTemplates(actor, workspace.id),
          listImportSessions(actor, workspace.id, 1, 20),
          listClients(actor, workspace.id, 1, 100),
          listProjects(actor, workspace.id, 1, 100),
          listWorkspaceMembers(actor, workspace.id, {
            status: "active",
            pageSize: 100,
          }),
        ]);
      return { workspace, templates, imports, clients, projects, directory };
    } catch {
      notFound();
    }
  })();
  return (
    <AdoptionWorkspace
      workspaceId={data.workspace.id}
      workspaceSlug={data.workspace.slug}
      templates={data.templates}
      imports={data.imports.items}
      clients={data.clients.items}
      projects={data.projects.items}
      members={data.directory.members}
    />
  );
}
