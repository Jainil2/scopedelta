"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

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
  const moreMenu = useRef<HTMLDetailsElement>(null);
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
        <details className="project-more-menu" ref={moreMenu}>
          <summary>
            More
            {activeLabel && secondary.some(([label]) => label === activeLabel)
              ? ` · ${activeLabel}`
              : ""}
          </summary>
          <div>
            {secondary.map(([label, href]) => (
              <Link
                href={href}
                key={href}
                onClick={() => {
                  setPendingHref(href);
                  if (moreMenu.current) moreMenu.current.open = false;
                }}
                aria-current={
                  projectPathActive(pathname, href, root) ? "page" : undefined
                }
              >
                {label}
              </Link>
            ))}
          </div>
        </details>
        {navigating ? (
          <span
            className="project-navigation-status"
            role="status"
            aria-live="polite"
          >
            Loading project workspace…
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
