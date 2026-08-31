import { notFound } from "next/navigation";

import { ProjectBriefWorkspace } from "@/components/collaboration-workspace";
import {
  listMentionableMembers,
  listProjectNotes,
} from "@/server/collaboration";
import { getRequestProject } from "@/server/request-context";

export default async function ProjectBriefPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
}>) {
  const { workspaceSlug, projectKey } = await params;
  const data = await loadBrief(workspaceSlug, projectKey);
  return (
    <ProjectBriefWorkspace
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      initialNotes={data.notes.data}
      members={data.members.data}
    />
  );
}

async function loadBrief(workspaceSlug: string, projectKey: string) {
  try {
    const { actor, workspace, project } = await getRequestProject(
      workspaceSlug,
      projectKey,
    );
    const [notes, members] = await Promise.all([
      listProjectNotes(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
        archived: false,
      }),
      listMentionableMembers(actor, workspace.id, project.id),
    ]);
    return { workspace, project, notes, members };
  } catch {
    notFound();
  }
}
