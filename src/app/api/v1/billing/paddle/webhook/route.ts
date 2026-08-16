import { apiData, apiError } from "@/lib/api";
import { PlatformError } from "@/lib/platform-errors";
import { processPaddleSubscriptionEvent } from "@/server/billing";
import { verifyPaddleWebhook } from "@/server/paddle-billing";

const MAXIMUM_WEBHOOK_BYTES = 524_288;

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || "0");
    if (length > MAXIMUM_WEBHOOK_BYTES) {
      throw new PlatformError(
        "payload_too_large",
        413,
        "The request body is too large.",
      );
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAXIMUM_WEBHOOK_BYTES) {
      throw new PlatformError(
        "payload_too_large",
        413,
        "The request body is too large.",
      );
    }
    const event = verifyPaddleWebhook(
      rawBody,
      request.headers.get("paddle-signature"),
    );
    return apiData(await processPaddleSubscriptionEvent(event, rawBody));
  } catch (error) {
    return apiError(error);
  }
}
