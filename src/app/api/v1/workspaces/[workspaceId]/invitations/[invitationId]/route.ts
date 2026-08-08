import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { revokeWorkspaceInvitation } from "@/server/workspaces";

type Context = {
  params: Promise<{ workspaceId: string; invitationId: string }>;
};

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, invitationId } = await context.params;
    return apiData(
      await revokeWorkspaceInvitation(actor, workspaceId, invitationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
