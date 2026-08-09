import { apiData, apiError, readJson } from "@/lib/api";
import { createCommercialBaselineSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createCommercialBaseline } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createCommercialBaselineSchema,
      await readJson(request),
    );
    return apiData(
      await createCommercialBaseline(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
