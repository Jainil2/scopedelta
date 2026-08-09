import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { getCommercialSource } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; sourceId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, sourceId } = await params;
    return apiData(
      await getCommercialSource(actor, workspaceId, projectId, sourceId),
    );
  } catch (error) {
    return apiError(error);
  }
}
