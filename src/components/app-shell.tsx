import Link from "next/link";

import type { WorkspaceRole } from "@/db/schema";
import { SignOutButton } from "@/components/auth-forms";
import { DesktopNotificationBridge } from "@/components/desktop-notification-bridge";
import { WebMcpBridge } from "@/components/webmcp-bridge";
import { WorkspaceNavigation } from "@/components/workspace-navigation";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

export function AppShell({
  current,
  workspaces,
  userId,
  userName,
  children,
}: Readonly<{
  current: Workspace;
  workspaces: readonly Workspace[];
  userId: string;
  userName: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="app-frame">
      <DesktopNotificationBridge />
      <aside className="app-sidebar">
        <Link className="app-wordmark" href="/">
          <span className="app-brand-mark" aria-hidden="true">
            Δ
          </span>{" "}
          ScopeDelta
        </Link>
        <div className="workspace-switcher">
          <span>Workspace</span>
          <details>
            <summary>
              {current.name}
              <small>{current.role}</small>
            </summary>
            <nav aria-label="Workspace switcher">
              {workspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/app/${workspace.slug}`}
                  aria-current={
                    workspace.id === current.id ? "page" : undefined
                  }
                >
                  {workspace.name}
                  <small>{workspace.role}</small>
                </Link>
              ))}
              <Link href="/onboarding">+ New workspace</Link>
            </nav>
          </details>
        </div>
        <WorkspaceNavigation workspaceSlug={current.slug} role={current.role} />
        <WebMcpBridge workspaceId={current.id} userId={userId} />
        <div className="app-account">
          <span>{userName}</span>
          <SignOutButton />
        </div>
      </aside>
      <main className="app-main" id="main-content">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </main>
    </div>
  );
}
