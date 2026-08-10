import { apiData, apiError, readJson } from "@/lib/api";
import { updateClientRequestStateSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientCollaborationNotificationEmails } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { updateClientRequestState } from "@/server/client-collaboration";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    requestId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, requestId } = await params;
    const input = parseInput(
      updateClientRequestStateSchema,
      await readJson(request),
    );
    const result = await updateClientRequestState(
      actor,
      workspaceId,
      projectId,
      requestId,
      input,
    );
    if (input.state === "needs_clarification") {
      await scheduleClientCollaborationNotificationEmails(
        `clarification:${requestId}:${input.idempotencyKey}`,
      );
    }
    return apiData(result);
  } catch (error) {
    return apiError(error);
  }
}
