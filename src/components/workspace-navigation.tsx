"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Workflow,
  Building2,
  CreditCard,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Leaf,
  ListTodo,
  Rocket,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { WorkspaceRole } from "@/db/schema";
import { cn } from "@/lib/utils";

type NavigationItem = readonly [label: string, path: string, icon: LucideIcon];

export function WorkspaceNavigation({
  workspaceSlug,
  role,
  onNavigate,
}: Readonly<{
  workspaceSlug: string;
  role: WorkspaceRole;
  onNavigate?: () => void;
}>) {
  const pathname = usePathname();
  const root = `/app/${workspaceSlug}`;
  const groups: Array<readonly [string, NavigationItem[]]> = [
    [
      "Workspace",
      [
        ["Overview", root, LayoutDashboard],
        ["Agent workflows", `${root}/workflows`, Workflow],
      ],
    ],
    [
      "Delivery",
      [
        ["Clients", `${root}/clients`, Building2],
        ["Projects", `${root}/projects`, FolderKanban],
        ["My work", `${root}/my-work`, ListTodo],
        ["Operations", `${root}/operations`, BarChart3],
      ],
    ],
    ["Communication", [["Inbox", `${root}/inbox`, Inbox]]],
    [
      "Administration",
      [
        ["Settings", `${root}/settings`, Settings],
        ["Members", `${root}/settings/members`, Users],
        ...(role !== "member"
          ? ([
              ["Getting started", `${root}/settings/getting-started`, Rocket],
              ["Adoption", `${root}/settings/adoption`, Leaf],
            ] as NavigationItem[])
          : []),
        ...(role === "owner"
          ? ([
              ["Billing", `${root}/settings/billing`, CreditCard],
            ] as NavigationItem[])
          : []),
      ],
    ],
  ];

  return (
    <nav className="app-navigation" aria-label="Workspace">
      {groups.map(([label, items]) => (
        <section className="app-navigation-group" key={label}>
          <h2>{label}</h2>
          <div>
            {items.map(([itemLabel, href, Icon]) => {
              const active = isActive(pathname, href, root);
              return (
                <Link
                  className={cn(active && "is-active")}
                  href={href}
                  key={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon aria-hidden="true" />
                  <span>{itemLabel}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function isActive(pathname: string, href: string, root: string) {
  if (href === root) return pathname === root;
  if (href === `${root}/settings`) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
