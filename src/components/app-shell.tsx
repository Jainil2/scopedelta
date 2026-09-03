import { AppMobileNavigation } from "@/components/app-mobile-navigation";
import { SignOutButton } from "@/components/auth-forms";
import { BrandLockup } from "@/components/brand";
import { DesktopNotificationBridge } from "@/components/desktop-notification-bridge";
import { WebMcpBridge } from "@/components/webmcp-bridge";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { WorkspaceRole } from "@/db/schema";
import { initials } from "@/lib/utils";

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
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <DesktopNotificationBridge />
      <aside className="app-sidebar">
        <div className="app-brand-block">
          <BrandLockup
            href={`/app/${current.slug}`}
            inverse
            label={`${current.name} workspace home`}
          />
          <p>Scope decisions, delivery evidence, and commercial control.</p>
        </div>
        <WorkspaceSwitcher current={current} workspaces={workspaces} />
        <WorkspaceNavigation workspaceSlug={current.slug} role={current.role} />
        <WebMcpBridge
          workspaceId={current.id}
          workspaceSlug={current.slug}
          userId={userId}
        />
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
      <AppMobileNavigation
        current={current}
        workspaces={workspaces}
        userName={userName}
      />
      <main className="app-main" id="main-content">
        {children}
      </main>
    </div>
  );
}
