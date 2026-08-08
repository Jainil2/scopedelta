import { notFound } from "next/navigation";

import { InboxWorkspace } from "@/components/collaboration-workspace";
import { paginationSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { listNotifications } from "@/server/collaboration";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function InboxPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const data = await loadInbox(actor, workspaceSlug, await searchParams);
  return (
    <InboxWorkspace
      key={data.result.page.number}
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
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const pagination = parseInput(paginationSchema, {
      page:
        typeof searchParams.page === "string" ? searchParams.page : undefined,
      pageSize: 50,
    });
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const result = await listNotifications(actor, workspace.id, {
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    return { workspace, result };
  } catch {
    notFound();
  }
}
