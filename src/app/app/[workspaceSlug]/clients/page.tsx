import { notFound } from "next/navigation";

import { ClientDirectory } from "@/components/delivery-workspace";
import { paginationSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listClients } from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function ClientsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const data = await loadClients(actor, workspaceSlug, await searchParams);
  return (
    <ClientDirectory
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      role={data.workspace.role}
      clients={data.result.items}
      pageInfo={data.result.pageInfo}
    />
  );
}

async function loadClients(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const pagination = parseInput(paginationSchema, {
      page:
        typeof searchParams.page === "string" ? searchParams.page : undefined,
      pageSize: 50,
    });
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const result = await listClients(
      actor,
      workspace.id,
      pagination.page,
      pagination.pageSize,
    );
    return { workspace, result };
  } catch {
    notFound();
  }
}
