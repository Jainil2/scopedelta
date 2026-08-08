import { apiData, apiError, readJson } from "@/lib/api";
import {
  notificationFilterSchema,
  updateNotificationBatchSchema,
} from "@/lib/collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listNotifications, updateNotifications } from "@/server/collaboration";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const filters = parseInput(
      notificationFilterSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(await listNotifications(actor, workspaceId, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(
      updateNotificationBatchSchema,
      await readJson(request, 8_192),
    );
    return apiData(
      await updateNotifications(actor, workspaceId, input.ids, input.read),
    );
  } catch (error) {
    return apiError(error);
  }
}
