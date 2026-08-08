import { apiData, apiError, readJson } from "@/lib/api";
import { updateMilestoneSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { updateMilestone } from "@/server/delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    milestoneId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, milestoneId } = await params;
    const input = parseInput(updateMilestoneSchema, await readJson(request));
    return apiData(
      await updateMilestone(actor, workspaceId, projectId, milestoneId, input),
    );
  } catch (error) {
    return apiError(error);
  }
}
