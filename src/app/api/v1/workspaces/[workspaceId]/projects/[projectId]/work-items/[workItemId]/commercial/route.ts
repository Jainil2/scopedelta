import { apiData, apiError, readJson } from "@/lib/api";
import { updateWorkPurposeSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  getWorkCommercialProvenance,
  updateWorkPurpose,
} from "@/server/commercial";

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
      await getWorkCommercialProvenance(
        actor,
        workspaceId,
        projectId,
        workItemId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId } = await params;
    const input = parseInput(updateWorkPurposeSchema, await readJson(request));
    return apiData(
      await updateWorkPurpose(actor, workspaceId, projectId, workItemId, input),
    );
  } catch (error) {
    return apiError(error);
  }
}
