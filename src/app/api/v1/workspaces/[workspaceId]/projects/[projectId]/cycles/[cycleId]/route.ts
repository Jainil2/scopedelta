import { apiData, apiError, readJson } from "@/lib/api";
import { updateCycleSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { updateCycle } from "@/server/delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    cycleId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, cycleId } = await params;
    const input = parseInput(updateCycleSchema, await readJson(request));
    return apiData(
      await updateCycle(actor, workspaceId, projectId, cycleId, input),
    );
  } catch (error) {
    return apiError(error);
  }
}
