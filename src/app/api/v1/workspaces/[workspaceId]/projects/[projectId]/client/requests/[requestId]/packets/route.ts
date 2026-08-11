import { apiData, apiError, readJson } from "@/lib/api";
import { publishClientPacketSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientCollaborationNotificationEmails } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { publishClientCommercialPacket } from "@/server/client-collaboration";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    requestId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, requestId } = await params;
    const input = parseInput(
      publishClientPacketSchema,
      await readJson(request),
    );
    const result = await publishClientCommercialPacket(
      actor,
      workspaceId,
      projectId,
      requestId,
      input,
    );
    await scheduleClientCollaborationNotificationEmails(`packet:${result.id}`);
    return apiData(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
