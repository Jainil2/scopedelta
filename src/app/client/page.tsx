import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandLockup } from "@/components/brand";
import { requireSession } from "@/lib/session";
import { listClientProjects } from "@/server/client-collaboration";
import { listWorkspaces } from "@/server/workspaces";

export const dynamic = "force-dynamic";

export default async function ClientHomePage() {
  const session = await requireSession();
  const actor = {
    userId: session.user.id,
    email: session.user.email,
  };
  const [projects, workspaces] = await Promise.all([
    listClientProjects(actor),
    listWorkspaces(actor),
  ]);
  if (projects.length === 1) redirect(`/client/projects/${projects[0]!.id}`);
  return (
    <main className="client-shell client-index">
      <header className="client-topbar">
        <BrandLockup href="/client" />
        <nav aria-label="Client navigation">
          <Link href="/client/notifications">Inbox</Link>
          {workspaces.length ? <Link href="/app">Team workspace</Link> : null}
        </nav>
      </header>
      <section className="client-hero">
        <p className="client-kicker">Your shared work</p>
        <h1>Projects</h1>
        <p>
          Choose a project to review delivery, requests, decisions, and
          acceptance.
        </p>
      </section>
      <section className="client-section">
        <div className="client-card-grid">
          {projects.map((project) => (
            <Link
              className="client-card client-project-link"
              href={`/client/projects/${project.id}`}
              key={project.id}
            >
              <span className="client-chip">{project.role}</span>
              <h2>{project.name}</h2>
              <span>Open project →</span>
            </Link>
          ))}
          {!projects.length ? (
            <div className="client-empty-state">
              <h2>No active client projects</h2>
              <p>
                Ask the project team for a fresh invitation if you expected
                access.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
