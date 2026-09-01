import Link from "next/link";
import { Suspense } from "react";

import { AppIcon } from "@/components/app-icon";
import type { WorkspaceRole } from "@/db/schema";
import { SignOutButton } from "@/components/auth-forms";
import { DesktopNotificationBridge } from "@/components/desktop-notification-bridge";
import { NavigationFeedback } from "@/components/navigation-feedback";
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
      <Suspense fallback={null}>
        <NavigationFeedback />
      </Suspense>
      <DesktopNotificationBridge />
      <aside className="app-sidebar">
        <div className="app-brand-block">
          <Link className="app-wordmark" href="/">
            <span className="app-brand-mark" aria-hidden="true">
              Δ
            </span>
            <span>ScopeDelta</span>
          </Link>
          <small>Delivery OS</small>
        </div>
        <div className="workspace-switcher">
          <span>Workspace</span>
          <details>
            <summary>
              <span className="workspace-avatar" aria-hidden="true">
                {initials(current.name)}
              </span>
              <span className="workspace-switcher-copy">
                <strong>{current.name}</strong>
                <small>{current.role}</small>
              </span>
              <AppIcon name="chevron" />
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
              <Link href="/onboarding">
                <AppIcon name="plus" /> New workspace
              </Link>
            </nav>
          </details>
        </div>
        <WorkspaceNavigation workspaceSlug={current.slug} role={current.role} />
        <WebMcpBridge workspaceId={current.id} userId={userId} />
        <div className="app-account">
          <span className="account-avatar" aria-hidden="true">
            {initials(userName)}
          </span>
          <span className="account-copy">
            <strong>{userName}</strong>
            <small>Signed in</small>
          </span>
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

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
