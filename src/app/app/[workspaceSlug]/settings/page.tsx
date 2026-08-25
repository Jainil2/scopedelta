import { WorkspaceSettingsForm } from "@/components/platform-forms";
import { WorkspaceLifecyclePanel } from "@/components/self-service-workspace";
import { requireSession } from "@/lib/session";
import { getWorkspaceBySlug } from "@/server/workspaces";
import { listWorkspaceLifecycleRequests } from "@/server/self-service";

export default async function WorkspaceSettingsPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
}>) {
  const session = await requireSession();
  const { workspaceSlug } = await params;
  const actor = { userId: session.user.id, email: session.user.email };
  const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
  const lifecycleRequests =
    workspace.role === "owner"
      ? await listWorkspaceLifecycleRequests(actor, workspace.id)
      : [];
  return (
    <div className="app-content">
      <header className="app-page-header">
        <div>
          <p className="app-eyebrow">Workspace settings</p>
          <h1>Identity and time zone</h1>
          <p>These values are scoped to {workspace.name}.</p>
        </div>
      </header>
      <section className="settings-section" aria-label="Workspace settings">
        <WorkspaceSettingsForm workspace={workspace} />
      </section>
      {workspace.role === "owner" ? (
        <WorkspaceLifecyclePanel
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          requests={lifecycleRequests}
        />
      ) : null}
    </div>
  );
}
