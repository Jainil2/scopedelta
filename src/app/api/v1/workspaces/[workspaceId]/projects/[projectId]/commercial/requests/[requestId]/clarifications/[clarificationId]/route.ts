import { apiData, apiError, readJson } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { updateRequestClarification } from "@/server/ai/clarifications";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    requestId: string;
    clarificationId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, requestId, clarificationId } = await params;
    return apiData(
      await updateRequestClarification(
        actor,
        workspaceId,
        projectId,
        requestId,
        clarificationId,
        await readJson(request),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
