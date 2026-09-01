"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { SignOutButton } from "@/components/auth-forms";
import { BrandLockup } from "@/components/brand";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { WorkspaceSwitcher, initials } from "@/components/workspace-switcher";
import type { WorkspaceRole } from "@/db/schema";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

export function AppMobileNavigation({
  current,
  workspaces,
  userName,
}: Readonly<{
  current: Workspace;
  workspaces: readonly Workspace[];
  userName: string;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="app-mobile-bar">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              className="app-mobile-menu"
              type="button"
              aria-label="Open workspace navigation"
            />
          }
        >
          <Menu aria-hidden="true" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[min(88vw,22rem)] gap-0 border-0 bg-[#20241f] p-0 text-stone-100"
        >
          <SheetHeader className="border-b border-white/10 px-5 py-5 text-left">
            <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Navigate ScopeDelta and switch workspaces.
            </SheetDescription>
            <BrandLockup
              href={`/app/${current.slug}`}
              inverse
              label={`${current.name} workspace home`}
            />
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
            <WorkspaceSwitcher current={current} workspaces={workspaces} />
            <WorkspaceNavigation
              workspaceSlug={current.slug}
              role={current.role}
              onNavigate={() => setOpen(false)}
            />
          </div>
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
        </SheetContent>
      </Sheet>
      <BrandLockup
        href={`/app/${current.slug}`}
        label={`${current.name} workspace home`}
      />
      <span className="app-mobile-workspace">{current.name}</span>
    </div>
  );
}
