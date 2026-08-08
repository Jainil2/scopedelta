import { notFound } from "next/navigation";

import { ClientDirectory } from "@/components/delivery-workspace";
import { requireSession } from "@/lib/session";
import { listClients } from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function ClientsPage({
  params,
}: Readonly<{ params: Promise<{ workspaceSlug: string }> }>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const data = await loadClients(actor, workspaceSlug);
  return (
    <ClientDirectory
      workspaceId={data.workspace.id}
      role={data.workspace.role}
      clients={data.result.items}
    />
  );
}

async function loadClients(
  actor: { userId: string; email: string },
  workspaceSlug: string,
) {
  try {
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const result = await listClients(actor, workspace.id);
    return { workspace, result };
  } catch {
    notFound();
  }
}
