"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProjectLink = readonly [label: string, path: string];

export function ProjectContextBar({
  workspaceSlug,
  project,
  canManageProject,
}: Readonly<{
  workspaceSlug: string;
  project: {
    key: string;
    name: string;
    clientName: string;
    leadName: string;
    lifecycle: string;
  };
  canManageProject: boolean;
}>) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const root = `/app/${workspaceSlug}/projects/${project.key}`;
  const navigating =
    pendingHref !== null && !projectPathActive(pathname, pendingHref, root);
  const primary: ProjectLink[] = [
    ["Overview", root],
    ["Backlog", `${root}/backlog`],
    ["Board", `${root}/board`],
    ...(canManageProject
      ? ([["Commercial", `${root}/commercial`]] as ProjectLink[])
      : []),
  ];
  const secondary: ProjectLink[] = [
    ["Cycles", `${root}/cycles`],
    ["Brief", `${root}/brief`],
    ...(canManageProject
      ? ([["Client collaboration", `${root}/client`]] as ProjectLink[])
      : []),
    ["Engineering & QA", `${root}/engineering`],
    ["AI intelligence", `${root}/ai`],
    ["Activity", `${root}/activity`],
  ];
  const activeLabel = [...primary, ...secondary].find(([, href]) =>
    projectPathActive(pathname, href, root),
  )?.[0];

  return (
    <section className="project-context-bar" aria-label="Project context">
      <div className="project-context-identity">
        <p>{project.clientName}</p>
        <div>
          <span className="project-key">{project.key}</span>
          <strong>{project.name}</strong>
        </div>
        <small>
          Lead {project.leadName} · {project.lifecycle}
        </small>
      </div>
      <nav className="project-context-navigation" aria-label="Project">
        {primary.map(([label, href]) => (
          <Link
            href={href}
            key={href}
            onClick={() => setPendingHref(href)}
            aria-current={
              projectPathActive(pathname, href, root) ? "page" : undefined
            }
          >
            {label}
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="project-more-menu"
            render={<button type="button" />}
          >
            More
            {activeLabel && secondary.some(([label]) => label === activeLabel)
              ? ` · ${activeLabel}`
              : ""}
            <ChevronDown aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56 rounded-lg border-border bg-popover p-1.5 shadow-lg"
          >
            {secondary.map(([label, href]) => (
              <DropdownMenuItem
                className="min-h-10 rounded-lg px-3"
                key={href}
                render={
                  <Link
                    href={href}
                    onClick={() => setPendingHref(href)}
                    aria-current={
                      projectPathActive(pathname, href, root)
                        ? "page"
                        : undefined
                    }
                  />
                }
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {navigating ? (
          <span
            className="project-navigation-status"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle aria-hidden="true" /> Loading project workspace…
          </span>
        ) : null}
      </nav>
    </section>
  );
}

function projectPathActive(pathname: string, href: string, root: string) {
  if (href === root) return pathname === root;
  return pathname === href || pathname.startsWith(`${href}/`);
}
