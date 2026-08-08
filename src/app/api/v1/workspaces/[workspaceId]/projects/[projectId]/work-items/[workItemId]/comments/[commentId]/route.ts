import { apiData, apiError, readJson } from "@/lib/api";
import { updateCommentSchema } from "@/lib/collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  deleteComment,
  getComment,
  updateComment,
} from "@/server/collaboration";

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
      await getComment(actor, workspaceId, projectId, workItemId, commentId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId, commentId } = await params;
    const input = parseInput(
      updateCommentSchema,
      await readJson(request, 16_384),
    );
    return apiData(
      await updateComment(
        actor,
        workspaceId,
        projectId,
        workItemId,
        commentId,
        input,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId, commentId } = await params;
    return apiData(
      await deleteComment(actor, workspaceId, projectId, workItemId, commentId),
    );
  } catch (error) {
    return apiError(error);
  }
}
