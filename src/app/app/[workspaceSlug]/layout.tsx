import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PlatformError } from "@/lib/platform-errors";
import { requireSession } from "@/lib/session";
import { getWorkspaceBySlug, listWorkspaces } from "@/server/workspaces";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const [current, available] = await loadWorkspace(actor, workspaceSlug);

  return (
    <AppShell
      current={current}
      workspaces={available}
      userName={session.user.name}
    >
      {children}
    </AppShell>
  );
}

async function loadWorkspace(
  actor: { userId: string; email: string },
  workspaceSlug: string,
) {
  try {
    return await Promise.all([
      getWorkspaceBySlug(actor, workspaceSlug),
      listWorkspaces(actor),
    ]);
  } catch (error) {
    if (error instanceof PlatformError && error.status === 404) notFound();
    throw error;
  }
}
