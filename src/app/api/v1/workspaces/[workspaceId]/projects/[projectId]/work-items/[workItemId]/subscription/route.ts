import { apiData, apiError, readJson } from "@/lib/api";
import { updateSubscriptionSchema } from "@/lib/collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getSubscription, updateSubscription } from "@/server/collaboration";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    workItemId: string;
  }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId } = await params;
    return apiData(
      await getSubscription(actor, workspaceId, projectId, workItemId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId } = await params;
    const input = parseInput(
      updateSubscriptionSchema,
      await readJson(request, 2_048),
    );
    return apiData(
      await updateSubscription(
        actor,
        workspaceId,
        projectId,
        workItemId,
        input.watching,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
