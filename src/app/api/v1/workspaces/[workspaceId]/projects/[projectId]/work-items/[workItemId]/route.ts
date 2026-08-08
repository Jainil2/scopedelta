import { apiData, apiError, readJson } from "@/lib/api";
import { updateWorkItemSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getWorkItem, updateWorkItem } from "@/server/delivery";

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
      await getWorkItem(actor, workspaceId, projectId, workItemId),
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
      updateWorkItemSchema,
      await readJson(request, 65_536),
    );
    return apiData(
      await updateWorkItem(actor, workspaceId, projectId, workItemId, input),
    );
  } catch (error) {
    return apiError(error);
  }
}
