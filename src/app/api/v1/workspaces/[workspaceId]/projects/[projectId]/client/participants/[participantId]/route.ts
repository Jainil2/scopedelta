import { apiData, apiError, readJson } from "@/lib/api";
import { updateClientParticipantSchema } from "@/lib/client-collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  revokeClientParticipant,
  updateClientParticipant,
} from "@/server/client-collaboration";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    participantId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, participantId } = await params;
    const input = parseInput(
      updateClientParticipantSchema,
      await readJson(request),
    );
    return apiData(
      await updateClientParticipant(
        actor,
        workspaceId,
        projectId,
        participantId,
        input.role,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, participantId } = await params;
    return apiData(
      await revokeClientParticipant(
        actor,
        workspaceId,
        projectId,
        participantId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
