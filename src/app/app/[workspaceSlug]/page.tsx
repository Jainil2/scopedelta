import { requireSession } from "@/lib/session";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function WorkspaceOverview({
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
          <p className="app-eyebrow">Platform kernel</p>
          <h1>{workspace.name}</h1>
          <p>
            Authenticated workspace · {workspace.timezone} · {workspace.role}
          </p>
        </div>
        <span className="kernel-status">
          <i aria-hidden="true" />
          Tenant boundary active
        </span>
      </header>
      <section className="kernel-proof" aria-labelledby="kernel-title">
        <div>
          <p className="section-index">Layer 0</p>
          <h2 id="kernel-title">The workspace is ready for delivery data.</h2>
        </div>
        <dl>
          <div>
            <dt>Identity</dt>
            <dd>Verified, database-backed session</dd>
          </div>
          <div>
            <dt>Authorization</dt>
            <dd>Server-side membership and role checks</dd>
          </div>
          <div>
            <dt>Audit</dt>
            <dd>Human and system events are attributable</dd>
          </div>
        </dl>
        <p>
          No clients, projects, work items, AI actions, or billing records exist
          yet. Those belong to later approved layers.
        </p>
      </section>
    </div>
  );
}
