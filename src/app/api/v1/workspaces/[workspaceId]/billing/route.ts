import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { getWorkspaceBillingOverview } from "@/server/billing";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    return apiData(await getWorkspaceBillingOverview(actor, workspaceId));
  } catch (error) {
    return apiError(error);
  }
}
