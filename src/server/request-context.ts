import { cache } from "react";

import { requireSession } from "@/lib/session";
import { getProjectByKey } from "@/server/delivery";
import { getWorkspaceBySlug, listWorkspaces } from "@/server/workspaces";

export const getRequestIdentity = cache(async () => {
  const session = await requireSession();
  return {
    session,
    actor: { userId: session.user.id, email: session.user.email },
  };
});

export const getRequestWorkspace = cache(async (workspaceSlug: string) => {
  const { actor } = await getRequestIdentity();
  return getWorkspaceBySlug(actor, workspaceSlug);
});

export const getRequestWorkspaces = cache(async () => {
  const { actor } = await getRequestIdentity();
  return listWorkspaces(actor);
});

export const getRequestProject = cache(
  async (workspaceSlug: string, projectKey: string) => {
    const [{ actor }, workspace] = await Promise.all([
      getRequestIdentity(),
      getRequestWorkspace(workspaceSlug),
    ]);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
    );
    return { actor, workspace, project };
  },
);
