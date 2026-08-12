import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { reconcileEngineeringRepository } from "@/server/engineering-delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    repositoryId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, repositoryId } = await params;
    return apiData(
      await reconcileEngineeringRepository(
        actor,
        workspaceId,
        projectId,
        repositoryId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
