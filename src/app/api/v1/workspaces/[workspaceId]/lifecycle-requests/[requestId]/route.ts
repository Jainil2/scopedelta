import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { cancelWorkspaceLifecycleRequest } from "@/server/self-service";

type Context = {
  params: Promise<{ workspaceId: string; requestId: string }>;
};

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, requestId } = await context.params;
    return apiData(
      await cancelWorkspaceLifecycleRequest(actor, workspaceId, requestId),
    );
  } catch (error) {
    return apiError(error);
  }
}
