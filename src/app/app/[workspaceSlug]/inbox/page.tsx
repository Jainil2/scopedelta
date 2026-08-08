import { notFound } from "next/navigation";

import { InboxWorkspace } from "@/components/collaboration-workspace";
import { requireSession } from "@/lib/session";
import { listNotifications } from "@/server/collaboration";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function InboxPage({
  params,
}: Readonly<{ params: Promise<{ workspaceSlug: string }> }>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const data = await loadInbox(actor, workspaceSlug);
  return (
    <InboxWorkspace
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      initialNotifications={data.result.data}
      page={data.result.page}
    />
  );
}

async function loadInbox(
  actor: { userId: string; email: string },
  workspaceSlug: string,
) {
  try {
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const result = await listNotifications(actor, workspace.id, {
      page: 1,
      pageSize: 50,
    });
    return { workspace, result };
  } catch {
    notFound();
  }
}
