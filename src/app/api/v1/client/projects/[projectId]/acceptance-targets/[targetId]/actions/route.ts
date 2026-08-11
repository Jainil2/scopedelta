import { apiData, apiError, readJson } from "@/lib/api";
import { actOnClientAcceptanceSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientCollaborationNotificationEmails } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { actOnClientAcceptanceTarget } from "@/server/client-collaboration";

type Context = { params: Promise<{ projectId: string; targetId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { projectId, targetId } = await params;
    const input = parseInput(
      actOnClientAcceptanceSchema,
      await readJson(request),
    );
    const result = await actOnClientAcceptanceTarget(
      actor,
      projectId,
      targetId,
      input,
    );
    await scheduleClientCollaborationNotificationEmails(
      `acceptance-action:${result.id}`,
    );
    return apiData(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
