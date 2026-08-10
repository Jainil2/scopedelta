import { apiData, apiError, readJson } from "@/lib/api";
import { createCommercialAmendmentSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createCommercialAmendment } from "@/server/commercial-amendments";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createCommercialAmendmentSchema,
      await readJson(request),
    );
    return apiData(
      await createCommercialAmendment(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
