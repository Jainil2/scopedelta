import { apiData, apiError } from "@/lib/api";
import { PlatformError } from "@/lib/platform-errors";
import { processGitHubWebhookDelivery } from "@/server/engineering-delivery";
import { verifyGitHubWebhookSignature } from "@/server/github-provider";

const MAX_WEBHOOK_BYTES = 1_048_576;

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_WEBHOOK_BYTES) {
      throw new PlatformError(
        "payload_too_large",
        413,
        "The request body is too large.",
      );
    }
    const deliveryId = request.headers.get("x-github-delivery")?.trim();
    const eventName = request.headers.get("x-github-event")?.trim();
    const signature = request.headers.get("x-hub-signature-256")?.trim();
    if (
      !deliveryId ||
      deliveryId.length > 200 ||
      !eventName ||
      !/^[a-z_]{1,80}$/.test(eventName) ||
      !signature
    ) {
      throw new PlatformError(
        "webhook_invalid",
        400,
        "The webhook request is invalid.",
      );
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
      throw new PlatformError(
        "payload_too_large",
        413,
        "The request body is too large.",
      );
    }
    if (!verifyGitHubWebhookSignature(rawBody, signature)) {
      throw new PlatformError(
        "webhook_signature_invalid",
        401,
        "The webhook signature is invalid.",
      );
    }
    return apiData(
      await processGitHubWebhookDelivery(deliveryId, eventName, rawBody),
      202,
    );
  } catch (error) {
    return apiError(error);
  }
}
