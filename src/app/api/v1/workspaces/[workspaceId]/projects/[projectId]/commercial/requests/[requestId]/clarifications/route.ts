import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { listRequestClarifications } from "@/server/ai/clarifications";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    requestId: string;
  }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, requestId } = await params;
    return apiData(
      await listRequestClarifications(actor, workspaceId, projectId, requestId),
    );
  } catch (error) {
    return apiError(error);
  }
}
