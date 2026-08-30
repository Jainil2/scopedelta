"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { WorkspaceRole } from "@/db/schema";

type NavigationItem = readonly [label: string, path: string];

export function WorkspaceNavigation({
  workspaceSlug,
  role,
}: Readonly<{ workspaceSlug: string; role: WorkspaceRole }>) {
  const pathname = usePathname();
  const root = `/app/${workspaceSlug}`;
  const groups: Array<readonly [string, NavigationItem[]]> = [
    ["Home", [["Overview", root]]],
    [
      "Delivery",
      [
        ["Clients", `${root}/clients`],
        ["Projects", `${root}/projects`],
        ["My work", `${root}/my-work`],
        ["Operations", `${root}/operations`],
      ],
    ],
    ["Collaboration", [["Inbox", `${root}/inbox`]]],
    [
      "Workspace",
      [
        ["Settings", `${root}/settings`],
        ["Members", `${root}/settings/members`],
        ...(role !== "member"
          ? ([
              ["Getting started", `${root}/settings/getting-started`],
              ["Adoption", `${root}/settings/adoption`],
            ] as NavigationItem[])
          : []),
        ...(role === "owner"
          ? ([["Billing", `${root}/settings/billing`]] as NavigationItem[])
          : []),
      ],
    ],
  ];
  const activeLabel = groups
    .flatMap(([, items]) => items)
    .find(([, href]) => isActive(pathname, href, root))?.[0];

  return (
    <nav className="app-navigation" aria-label="Workspace">
      <details className="workspace-navigation-menu" open>
        <summary>
          Workspace menu{activeLabel ? ` · ${activeLabel}` : ""}
        </summary>
        <div>{renderGroups(groups, pathname, root)}</div>
      </details>
    </nav>
  );
}

function renderGroups(
  groups: Array<readonly [string, NavigationItem[]]>,
  pathname: string,
  root: string,
) {
  return groups.map(([label, items]) => (
    <section className="app-navigation-group" key={label}>
      <h2>{label}</h2>
      {items.map(([itemLabel, href]) => (
        <Link
          href={href}
          key={href}
          aria-current={isActive(pathname, href, root) ? "page" : undefined}
        >
          {itemLabel}
        </Link>
      ))}
    </section>
  ));
}

function isActive(pathname: string, href: string, root: string) {
  if (href === root) return pathname === root;
  if (href === `${root}/settings`) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
