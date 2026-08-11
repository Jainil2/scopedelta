import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { hideClientProjectItem } from "@/server/client-collaboration";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; itemId: string }>;
};

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, itemId } = await params;
    return apiData(
      await hideClientProjectItem(actor, workspaceId, projectId, itemId),
    );
  } catch (error) {
    return apiError(error);
  }
}
