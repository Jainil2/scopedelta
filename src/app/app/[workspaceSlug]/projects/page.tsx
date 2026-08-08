import { notFound } from "next/navigation";

import { ProjectDirectory } from "@/components/delivery-workspace";
import { paginationSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listClients, listProjects } from "@/server/delivery";
import { getWorkspaceBySlug, listWorkspaceMembers } from "@/server/workspaces";

export default async function ProjectsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const data = await loadProjects(actor, workspaceSlug, await searchParams);
  return (
    <ProjectDirectory
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      clients={data.clientResult.items}
      clientPageInfo={data.clientResult.pageInfo}
      members={data.directory.members}
      projects={data.projectResult.items}
      projectPageInfo={data.projectResult.pageInfo}
    />
  );
}

async function loadProjects(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const projectPagination = parseInput(paginationSchema, {
      page:
        typeof searchParams.page === "string" ? searchParams.page : undefined,
      pageSize: 50,
    });
    const clientPagination = parseInput(paginationSchema, {
      page:
        typeof searchParams.clientPage === "string"
          ? searchParams.clientPage
          : undefined,
      pageSize: 50,
    });
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const [clientResult, projectResult, directory] = await Promise.all([
      listClients(
        actor,
        workspace.id,
        clientPagination.page,
        clientPagination.pageSize,
      ),
      listProjects(
        actor,
        workspace.id,
        projectPagination.page,
        projectPagination.pageSize,
      ),
      listWorkspaceMembers(actor, workspace.id),
    ]);
    return { workspace, clientResult, projectResult, directory };
  } catch {
    notFound();
  }
}
