import { apiData, apiError, readJson } from "@/lib/api";
import { reorderWorkItemSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { reorderWorkItem } from "@/server/delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    workItemId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId } = await params;
    const input = parseInput(reorderWorkItemSchema, await readJson(request));
    return apiData(
      await reorderWorkItem(
        actor,
        workspaceId,
        projectId,
        workItemId,
        input.direction,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
