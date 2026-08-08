import { apiData, apiError } from "@/lib/api";
import { activityFilterSchema } from "@/lib/collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listActivity } from "@/server/collaboration";

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
      activityFilterSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listActivity(actor, workspaceId, projectId, filters, workItemId),
    );
  } catch (error) {
    return apiError(error);
  }
}
