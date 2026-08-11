import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { markClientNotificationRead } from "@/server/client-collaboration";

type Context = {
  params: Promise<{ workspaceId: string; notificationId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, notificationId } = await params;
    return apiData(
      await markClientNotificationRead(actor, notificationId, workspaceId),
    );
  } catch (error) {
    return apiError(error);
  }
}
