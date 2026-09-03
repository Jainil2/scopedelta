"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceRole } from "@/db/schema";
import { initials } from "@/lib/utils";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

export function WorkspaceSwitcher({
  current,
  workspaces,
}: Readonly<{
  current: Workspace;
  workspaces: readonly Workspace[];
}>) {
  return (
    <div className="workspace-switcher">
      <span>Current workspace</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="workspace-switcher-trigger" />
          }
        >
          <span className="workspace-avatar" aria-hidden="true">
            {initials(current.name)}
          </span>
          <span className="workspace-switcher-copy">
            <strong>{current.name}</strong>
            <small>{current.role}</small>
          </span>
          <ChevronsUpDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[var(--anchor-width)] min-w-64 rounded-lg border-border bg-popover p-1.5 shadow-lg"
          sideOffset={8}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2.5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Switch workspace
            </DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                className="min-h-11 gap-3 rounded-lg px-2.5 py-2"
                render={<Link href={`/app/${workspace.slug}`} />}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-[0.65rem] font-semibold text-secondary-foreground">
                  {initials(workspace.name)}
                </span>
                <span className="grid min-w-0 flex-1">
                  <strong className="truncate text-sm font-semibold">
                    {workspace.name}
                  </strong>
                  <small className="capitalize text-muted-foreground">
                    {workspace.role}
                  </small>
                </span>
                {workspace.id === current.id ? (
                  <Check className="size-4 text-seal" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="min-h-10 gap-2 rounded-lg px-2.5"
            render={<Link href="/onboarding" />}
          >
            <Plus className="size-4" aria-hidden="true" />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
