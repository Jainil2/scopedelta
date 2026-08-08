import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { listMentionableMembers } from "@/server/collaboration";

type Context = { params: Promise<{ workspaceId: string; projectId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    return apiData(await listMentionableMembers(actor, workspaceId, projectId));
  } catch (error) {
    return apiError(error);
  }
}
