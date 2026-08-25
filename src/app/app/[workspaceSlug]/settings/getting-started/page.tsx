import { notFound } from "next/navigation";

import { GettingStartedWorkspace } from "@/components/self-service-workspace";
import { requireSession } from "@/lib/session";
import { getWorkspaceOnboarding } from "@/server/self-service";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function GettingStartedPage({
  params,
}: Readonly<{ params: Promise<{ workspaceSlug: string }> }>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
  if (workspace.role === "member") notFound();
  const onboarding = await getWorkspaceOnboarding(actor, workspace.id);
  return (
    <div className="app-content">
      <header className="app-page-header">
        <div>
          <p className="app-eyebrow">Getting started · {workspace.name}</p>
          <h1>Reach the first useful delivery state</h1>
          <p>A resumable checklist backed by actual workspace records.</p>
        </div>
      </header>
      <GettingStartedWorkspace
        workspaceId={workspace.id}
        onboarding={onboarding}
      />
    </div>
  );
}
