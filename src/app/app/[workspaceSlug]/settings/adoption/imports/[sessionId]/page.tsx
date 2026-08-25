import { notFound } from "next/navigation";

import { ImportResultWorkspace } from "@/components/adoption-workspace";
import { importRowPaginationSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { getImportSession } from "@/server/adoption";
import { getWorkspaceBySlug, listWorkspaceMembers } from "@/server/workspaces";

export default async function ImportResultPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, sessionId } = await params;
  const query = await searchParams;
  const data = await (async () => {
    try {
      const filters = parseInput(importRowPaginationSchema, {
        page: typeof query.page === "string" ? query.page : undefined,
        pageSize: 100,
      });
      const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
      if (workspace.role === "member") notFound();
      const [result, directory] = await Promise.all([
        getImportSession(
          actor,
          workspace.id,
          sessionId,
          filters.page,
          filters.pageSize,
        ),
        listWorkspaceMembers(actor, workspace.id, {
          status: "active",
          pageSize: 100,
        }),
      ]);
      return { workspace, result, directory };
    } catch {
      notFound();
    }
  })();
  return (
    <ImportResultWorkspace
      workspaceId={data.workspace.id}
      workspaceSlug={data.workspace.slug}
      initialResult={data.result}
      members={data.directory.members}
    />
  );
}
