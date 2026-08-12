import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { disconnectEngineeringRepository } from "@/server/engineering-delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    repositoryId: string;
  }>;
};

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, repositoryId } = await params;
    await disconnectEngineeringRepository(
      actor,
      workspaceId,
      projectId,
      repositoryId,
    );
    return apiData({ disconnected: true });
  } catch (error) {
    return apiError(error);
  }
}
