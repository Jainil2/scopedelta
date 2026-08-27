import Link from "next/link";

import type { WorkspaceRole } from "@/db/schema";
import { SignOutButton } from "@/components/auth-forms";
import { DesktopNotificationBridge } from "@/components/desktop-notification-bridge";
import { WebMcpBridge } from "@/components/webmcp-bridge";

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
        <nav className="app-navigation" aria-label="Workspace">
          <Link href={`/app/${current.slug}`}>Overview</Link>
          <Link href={`/app/${current.slug}/clients`}>Clients</Link>
          <Link href={`/app/${current.slug}/projects`}>Projects</Link>
          <Link href={`/app/${current.slug}/my-work`}>My work</Link>
          <Link href={`/app/${current.slug}/operations`}>Operations</Link>
          <Link href={`/app/${current.slug}/inbox`}>Inbox</Link>
          <Link href={`/app/${current.slug}/settings`}>Settings</Link>
          <Link href={`/app/${current.slug}/settings/members`}>Members</Link>
          {current.role !== "member" ? (
            <>
              <Link href={`/app/${current.slug}/settings/getting-started`}>
                Getting started
              </Link>
              <Link href={`/app/${current.slug}/settings/adoption`}>
                Adoption
              </Link>
            </>
          ) : null}
          {current.role === "owner" ? (
            <Link href={`/app/${current.slug}/settings/billing`}>Billing</Link>
          ) : null}
        </nav>
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
