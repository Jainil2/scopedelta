import { apiData, apiError, readJson } from "@/lib/api";
import { createCommercialImpactAssessmentSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createCommercialImpactAssessment } from "@/server/commercial-change-control";

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
      createCommercialImpactAssessmentSchema,
      await readJson(request, 65_536),
    );
    return apiData(
      await createCommercialImpactAssessment(
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
