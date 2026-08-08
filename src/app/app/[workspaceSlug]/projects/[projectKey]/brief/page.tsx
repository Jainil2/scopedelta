import { notFound } from "next/navigation";

import { ProjectBriefWorkspace } from "@/components/collaboration-workspace";
import { requireSession } from "@/lib/session";
import {
  listMentionableMembers,
  listProjectNotes,
} from "@/server/collaboration";
import { getProjectByKey } from "@/server/delivery";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function ProjectBriefPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey } = await params;
  const data = await loadBrief(actor, workspaceSlug, projectKey);
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

async function loadBrief(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  projectKey: string,
) {
  try {
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
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
