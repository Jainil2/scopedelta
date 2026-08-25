import Link from "next/link";

import { requireSession } from "@/lib/session";
import { listClients, listProjects } from "@/server/delivery";
import { getWorkspaceOnboarding } from "@/server/self-service";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function WorkspaceOverview({
  params,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
}>) {
  const session = await requireSession();
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(
    { userId: session.user.id, email: session.user.email },
    workspaceSlug,
  );
  const actor = { userId: session.user.id, email: session.user.email };
  const [clientResult, projectResult, onboarding] = await Promise.all([
    listClients(actor, workspace.id, 1, 1),
    listProjects(actor, workspace.id, 1, 1),
    workspace.role === "member"
      ? Promise.resolve(null)
      : getWorkspaceOnboarding(actor, workspace.id),
  ]);
  return (
    <div className="app-content">
      <header className="app-page-header">
        <div>
          <p className="app-eyebrow">Delivery workspace</p>
          <h1>{workspace.name}</h1>
          <p>
            Authenticated workspace · {workspace.timezone} · {workspace.role}
          </p>
        </div>
        <span className="kernel-status">
          <i aria-hidden="true" /> Tenant boundary active
        </span>
      </header>
      {onboarding && !onboarding.complete && !onboarding.dismissed ? (
        <section className="onboarding-prompt" aria-label="Getting started">
          <div>
            <strong>
              {onboarding.completedRequired} of {onboarding.requiredCount} core
              activation steps complete
            </strong>
            <p>Continue from authoritative workspace state at any time.</p>
          </div>
          <Link href={`/app/${workspace.slug}/settings/getting-started`}>
            Continue setup
          </Link>
        </section>
      ) : null}
      <section className="kernel-proof" aria-labelledby="kernel-title">
        <div>
          <p className="section-index">Layer 1A</p>
          <h2 id="kernel-title">Client-project delivery starts here.</h2>
        </div>
        <dl>
          <div>
            <dt>Clients</dt>
            <dd>{clientResult.pageInfo.total} delivery accounts</dd>
          </div>
          <div>
            <dt>Projects</dt>
            <dd>{projectResult.pageInfo.total} accessible projects</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>Server-authorized project membership</dd>
          </div>
        </dl>
        <p className="workspace-actions">
          <Link href={`/app/${workspace.slug}/clients`}>Manage clients</Link>
          <Link href={`/app/${workspace.slug}/projects`}>Open projects</Link>
        </p>
      </section>
    </div>
  );
}
