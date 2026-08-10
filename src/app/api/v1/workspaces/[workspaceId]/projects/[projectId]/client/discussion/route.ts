import { apiData, apiError, readJson } from "@/lib/api";
import { createClientDiscussionSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientCollaborationNotificationEmails } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createInternalClientDiscussionMessage } from "@/server/client-collaboration";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createClientDiscussionSchema,
      await readJson(request),
    );
    const result = await createInternalClientDiscussionMessage(
      actor,
      workspaceId,
      projectId,
      input,
    );
    await scheduleClientCollaborationNotificationEmails(
      `team-discussion:${result.id}`,
    );
    return apiData(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
