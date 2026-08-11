import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { revokeClientInvitation } from "@/server/client-collaboration";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    invitationId: string;
  }>;
};

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, invitationId } = await params;
    return apiData(
      await revokeClientInvitation(actor, workspaceId, projectId, invitationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
