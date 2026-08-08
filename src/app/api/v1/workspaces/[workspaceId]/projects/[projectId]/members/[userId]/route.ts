import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { removeProjectMember } from "@/server/delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; userId: string }>;
};

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, userId } = await params;
    return apiData(
      await removeProjectMember(actor, workspaceId, projectId, userId),
    );
  } catch (error) {
    return apiError(error);
  }
}
