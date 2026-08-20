import { apiData, apiError, readJson } from "@/lib/api";
import { availabilityInputSchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { setWorkspaceAvailability } from "@/server/operations";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(availabilityInputSchema, await readJson(request));
    return apiData(
      await setWorkspaceAvailability(actor, workspaceId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
