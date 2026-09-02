import Link from "next/link";

import { BrandLockup } from "@/components/brand";
import { WorkspaceCreateForm } from "@/components/platform-forms";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";
import { listWorkspaces } from "@/server/workspaces";

export default async function OnboardingPage() {
  const session = await requireSession();
  const existing = await listWorkspaces({
    userId: session.user.id,
    email: session.user.email,
  });
  return (
    <main className="onboarding-page">
      <header className="auth-header">
        <BrandLockup />
        {existing[0] ? (
          <Link className="auth-home-link" href={`/app/${existing[0].slug}`}>
            Back to workspace
          </Link>
        ) : null}
      </header>
      <section className="onboarding-layout">
        <div>
          <p className="app-eyebrow">Workspace setup</p>
          <h1>
            {existing.length
              ? "Create another workspace."
              : "Name your delivery workspace."}
          </h1>
          <p>
            Every project and platform event added later will inherit this
            tenant boundary. The default time zone is UTC and can be changed in
            settings.
          </p>
        </div>
        <WorkspaceCreateForm />
      </section>
    </main>
  );
}
