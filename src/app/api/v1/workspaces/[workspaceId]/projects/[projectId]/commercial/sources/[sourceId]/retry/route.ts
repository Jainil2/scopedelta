import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { retryCommercialSource } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; sourceId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, sourceId } = await params;
    return apiData(
      await retryCommercialSource(actor, workspaceId, projectId, sourceId),
    );
  } catch (error) {
    return apiError(error);
  }
}
