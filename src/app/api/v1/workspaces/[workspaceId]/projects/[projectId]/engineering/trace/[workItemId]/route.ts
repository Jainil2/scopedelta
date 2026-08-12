import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { getDeliveryEvidenceTrace } from "@/server/engineering-delivery";

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
      await getDeliveryEvidenceTrace(actor, workspaceId, projectId, workItemId),
    );
  } catch (error) {
    return apiError(error);
  }
}
