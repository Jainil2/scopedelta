import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { openBillingPortal } from "@/server/billing";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    return apiData(await openBillingPortal(actor, workspaceId), 201);
  } catch (error) {
    return apiError(error);
  }
}
