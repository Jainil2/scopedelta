import { z } from "zod";

import { apiData, apiError } from "@/lib/api";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listDesktopNotifications } from "@/server/desktop";

const desktopNotificationQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireApiActor(request);
    const url = new URL(request.url);
    const input = parseInput(desktopNotificationQuerySchema, {
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const response = apiData(
      await listDesktopNotifications(actor, input.cursor, input.limit),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiError(error);
  }
}
