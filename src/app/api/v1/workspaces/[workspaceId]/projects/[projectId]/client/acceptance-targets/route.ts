import { apiData, apiError, readJson } from "@/lib/api";
import { publishClientAcceptanceSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientCollaborationNotificationEmails } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { publishClientAcceptanceTarget } from "@/server/client-collaboration";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      publishClientAcceptanceSchema,
      await readJson(request),
    );
    const result = await publishClientAcceptanceTarget(
      actor,
      workspaceId,
      projectId,
      input,
    );
    await scheduleClientCollaborationNotificationEmails(
      `acceptance:${result.id}`,
    );
    return apiData(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
