import { apiData, apiError, readJson } from "@/lib/api";
import { createClientRequestSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientCollaborationNotificationEmails } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createClientRequest } from "@/server/client-collaboration";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { projectId } = await params;
    const input = parseInput(
      createClientRequestSchema,
      await readJson(request),
    );
    const result = await createClientRequest(actor, projectId, input);
    await scheduleClientCollaborationNotificationEmails(
      `client-request:${result.id}`,
    );
    return apiData(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
