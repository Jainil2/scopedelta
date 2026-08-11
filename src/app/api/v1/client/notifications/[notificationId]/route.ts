import { apiData, apiError } from "@/lib/api";
import { scheduleClientCollaborationNotificationEmails } from "@/lib/email";
import { PlatformError } from "@/lib/platform-errors";
import { requireApiActor } from "@/server/api-auth";
import {
  markClientNotificationRead,
  retryClientNotificationEmail,
} from "@/server/client-collaboration";

type Context = { params: Promise<{ notificationId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { notificationId } = await params;
    return apiData(await markClientNotificationRead(actor, notificationId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { notificationId } = await params;
    const notification = await retryClientNotificationEmail(
      actor,
      notificationId,
    );
    const scheduled = await scheduleClientCollaborationNotificationEmails(
      notification.dedupeKey,
    );
    if (!scheduled) {
      throw new PlatformError(
        "client_notification_email_unavailable",
        409,
        "Email delivery is not configured or this notification is already queued.",
      );
    }
    return apiData({ id: notificationId, emailDeliveryState: "pending" });
  } catch (error) {
    return apiError(error);
  }
}
