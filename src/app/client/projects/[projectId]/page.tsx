import { notFound } from "next/navigation";

import { ClientProjectWorkspace } from "@/components/client-project-workspace";
import { clientPageSchema } from "@/lib/client-collaboration-validation";
import { requireSession } from "@/lib/session";
import {
  getClientProjectProjection,
  listClientProjects,
} from "@/server/client-collaboration";
import { listWorkspaces } from "@/server/workspaces";

export const dynamic = "force-dynamic";

export default async function ClientProjectPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { projectId } = await params;
  const query = await searchParams;
  const historyPage = clientPageSchema.parse({
    page: typeof query.page === "string" ? query.page : undefined,
    pageSize: typeof query.pageSize === "string" ? query.pageSize : undefined,
  });
  const pageData = await (async () => {
    const [projects, projection, workspaces] = await Promise.all([
      listClientProjects(actor),
      getClientProjectProjection(actor, projectId, historyPage),
      listWorkspaces(actor),
    ]);
    return { projects, projection, workspaces };
  })().catch(() => notFound());

  return (
    <ClientProjectWorkspace
      projects={pageData.projects.map(({ id, name, role }) => ({
        id,
        name,
        role,
      }))}
      projection={pageData.projection}
      hasInternalAccess={pageData.workspaces.length > 0}
    />
  );
}
