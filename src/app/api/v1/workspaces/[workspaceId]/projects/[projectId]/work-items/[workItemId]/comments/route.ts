import { apiData, apiError, readJson } from "@/lib/api";
import { createCommentSchema } from "@/lib/collaboration-validation";
import { paginationSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createComment, listComments } from "@/server/collaboration";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    workItemId: string;
  }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId } = await params;
    const filters = parseInput(
      paginationSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listComments(
        actor,
        workspaceId,
        projectId,
        workItemId,
        filters.page,
        filters.pageSize,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId } = await params;
    const input = parseInput(
      createCommentSchema,
      await readJson(request, 16_384),
    );
    return apiData(
      await createComment(actor, workspaceId, projectId, workItemId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
