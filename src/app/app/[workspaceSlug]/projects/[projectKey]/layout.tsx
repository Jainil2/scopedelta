import { notFound } from "next/navigation";

import { ProjectContextBar } from "@/components/project-context-bar";
import { PlatformError } from "@/lib/platform-errors";
import { getRequestProject } from "@/server/request-context";

export default async function ProjectLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const project = await loadProject(workspaceSlug, projectKey);
  return (
    <div className="project-context-shell">
      <ProjectContextBar
        workspaceSlug={workspaceSlug}
        project={project}
        canManageProject={project.canManage}
      />
      <div className="project-page-slot">{children}</div>
    </div>
  );
}

async function loadProject(workspaceSlug: string, projectKey: string) {
  try {
    const { project } = await getRequestProject(workspaceSlug, projectKey);
    return project;
  } catch (error) {
    if (error instanceof PlatformError && error.status === 404) notFound();
    throw error;
  }
}
