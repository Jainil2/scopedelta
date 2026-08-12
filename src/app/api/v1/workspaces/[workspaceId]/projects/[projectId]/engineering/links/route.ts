import { apiData, apiError, readJson } from "@/lib/api";
import { manualImplementationLinkSchema } from "@/lib/engineering-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { linkImplementationEvidence } from "@/server/engineering-delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      manualImplementationLinkSchema,
      await readJson(request),
    );
    return apiData(
      await linkImplementationEvidence(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
