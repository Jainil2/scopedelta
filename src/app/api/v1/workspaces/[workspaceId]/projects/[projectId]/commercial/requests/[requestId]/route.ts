import { apiData, apiError, readJson } from "@/lib/api";
import { updateCommercialRequestStateSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  getCommercialRequest,
  updateCommercialRequestState,
} from "@/server/commercial-change-control";

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
      await getCommercialRequest(actor, workspaceId, projectId, requestId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, requestId } = await params;
    const input = parseInput(
      updateCommercialRequestStateSchema,
      await readJson(request),
    );
    return apiData(
      await updateCommercialRequestState(
        actor,
        workspaceId,
        projectId,
        requestId,
        input,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
