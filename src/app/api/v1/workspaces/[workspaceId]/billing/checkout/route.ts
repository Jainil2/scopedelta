import { apiData, apiError, readJson } from "@/lib/api";
import { startCheckoutSchema } from "@/lib/billing-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { startCheckout } from "@/server/billing";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(startCheckoutSchema, await readJson(request));
    return apiData(
      await startCheckout(
        actor,
        workspaceId,
        input.planKey,
        input.idempotencyKey,
      ),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
