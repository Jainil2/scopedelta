import { apiData, apiError, readJson } from "@/lib/api";
import {
  parseInput,
  workspaceLifecycleRequestSchema,
} from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  listWorkspaceLifecycleRequests,
  requestWorkspaceLifecycle,
} from "@/server/self-service";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    return apiData(
      await listWorkspaceLifecycleRequests(
        await requireApiActor(request),
        workspaceId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await context.params;
    const input = parseInput(
      workspaceLifecycleRequestSchema,
      await readJson(request),
    );
    return apiData(
      await requestWorkspaceLifecycle(actor, workspaceId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
