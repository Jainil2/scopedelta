import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { listCommercialOverview } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    return apiData(await listCommercialOverview(actor, workspaceId, projectId));
  } catch (error) {
    return apiError(error);
  }
}
