import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { listWorkspaceMembers } from "@/server/workspaces";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    return apiData(
      await listWorkspaceMembers(await requireApiActor(request), workspaceId),
    );
  } catch (error) {
    return apiError(error);
  }
}
