import { apiData, apiError, readJson } from "@/lib/api";
import { createDependencySchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { addDependency } from "@/server/delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    workItemId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId } = await params;
    const input = parseInput(createDependencySchema, await readJson(request));
    return apiData(
      await addDependency(
        actor,
        workspaceId,
        projectId,
        workItemId,
        input.blockedWorkItemId,
      ),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
