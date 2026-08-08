import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { listCommentHistory } from "@/server/collaboration";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    workItemId: string;
    commentId: string;
  }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId, commentId } = await params;
    return apiData(
      await listCommentHistory(
        actor,
        workspaceId,
        projectId,
        workItemId,
        commentId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
