import { WorkspaceSettingsForm } from "@/components/platform-forms";
import { requireSession } from "@/lib/session";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const session = await requireSession();
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(
    { userId: session.user.id, email: session.user.email },
    workspaceSlug,
  );
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
    </div>
  );
}
