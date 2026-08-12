import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { unlinkImplementationEvidence } from "@/server/engineering-delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    linkId: string;
  }>;
};

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, linkId } = await params;
    await unlinkImplementationEvidence(actor, workspaceId, projectId, linkId);
    return apiData({ unlinked: true });
  } catch (error) {
    return apiError(error);
  }
}
