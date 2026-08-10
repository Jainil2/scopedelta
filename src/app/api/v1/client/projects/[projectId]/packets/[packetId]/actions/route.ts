import { apiData, apiError, readJson } from "@/lib/api";
import { actOnClientPacketSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientCollaborationNotificationEmails } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { actOnClientCommercialPacket } from "@/server/client-collaboration";

type Context = { params: Promise<{ projectId: string; packetId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { projectId, packetId } = await params;
    const input = parseInput(actOnClientPacketSchema, await readJson(request));
    const result = await actOnClientCommercialPacket(
      actor,
      projectId,
      packetId,
      input,
    );
    await scheduleClientCollaborationNotificationEmails(
      `packet-action:${result.id}`,
    );
    return apiData(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
