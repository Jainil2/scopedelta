import { apiData, apiError } from "@/lib/api";
import {
  parseInput,
  workspaceDirectoryFiltersSchema,
} from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listWorkspaceMembers } from "@/server/workspaces";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const filters = parseInput(
      workspaceDirectoryFiltersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listWorkspaceMembers(
        await requireApiActor(request),
        workspaceId,
        filters,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
