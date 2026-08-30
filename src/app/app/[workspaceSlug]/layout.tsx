import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PlatformError } from "@/lib/platform-errors";
import {
  getRequestIdentity,
  getRequestWorkspace,
  getRequestWorkspaces,
} from "@/server/request-context";

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}>) {
  const { workspaceSlug } = await params;
  const [{ session }, current, available] = await loadWorkspace(workspaceSlug);

  return (
    <AppShell
      current={current}
      workspaces={available}
      userId={session.user.id}
      userName={session.user.name}
    >
      {children}
    </AppShell>
  );
}

async function loadWorkspace(workspaceSlug: string) {
  try {
    return await Promise.all([
      getRequestIdentity(),
      getRequestWorkspace(workspaceSlug),
      getRequestWorkspaces(),
    ]);
  } catch (error) {
    if (error instanceof PlatformError && error.status === 404) notFound();
    throw error;
  }
}
