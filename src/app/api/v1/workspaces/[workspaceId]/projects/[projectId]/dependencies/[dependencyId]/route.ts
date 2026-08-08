import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { removeDependency } from "@/server/delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    dependencyId: string;
  }>;
};

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, dependencyId } = await params;
    return apiData(
      await removeDependency(actor, workspaceId, projectId, dependencyId),
    );
  } catch (error) {
    return apiError(error);
  }
}
