import { apiData, apiError, readJson } from "@/lib/api";
import { createCommercialDecisionSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createCommercialDecision } from "@/server/commercial-change-control";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    requestId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, requestId } = await params;
    const input = parseInput(
      createCommercialDecisionSchema,
      await readJson(request, 65_536),
    );
    return apiData(
      await createCommercialDecision(
        actor,
        workspaceId,
        projectId,
        requestId,
        input,
      ),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
