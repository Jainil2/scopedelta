import { apiData, apiError, readJson } from "@/lib/api";
import { availabilityInputSchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { setMemberAvailability } from "@/server/operations";

type Context = {
  params: Promise<{ workspaceId: string; memberUserId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, memberUserId } = await params;
    const input = parseInput(availabilityInputSchema, await readJson(request));
    return apiData(
      await setMemberAvailability(actor, workspaceId, memberUserId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
