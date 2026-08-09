import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { removeCommercialBasisLink } from "@/server/commercial";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    workItemId: string;
    linkId: string;
  }>;
};

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId, linkId } = await params;
    return apiData(
      await removeCommercialBasisLink(
        actor,
        workspaceId,
        projectId,
        workItemId,
        linkId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
