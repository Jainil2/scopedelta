import { apiData, apiError } from "@/lib/api";
import { mentionableMemberFilterSchema } from "@/lib/collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listMentionableMembers } from "@/server/collaboration";

type Context = { params: Promise<{ workspaceId: string; projectId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const filters = parseInput(
      mentionableMemberFilterSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listMentionableMembers(actor, workspaceId, projectId, filters),
    );
  } catch (error) {
    return apiError(error);
  }
}
