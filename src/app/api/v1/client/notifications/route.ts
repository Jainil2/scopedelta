import { apiData, apiError } from "@/lib/api";
import { clientPageSchema } from "@/lib/client-collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listClientNotifications } from "@/server/client-collaboration";

export async function GET(request: Request) {
  try {
    const actor = await requireApiActor(request);
    const url = new URL(request.url);
    const input = parseInput(clientPageSchema, {
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    return apiData(
      await listClientNotifications(actor, input.page, input.pageSize),
    );
  } catch (error) {
    return apiError(error);
  }
}
