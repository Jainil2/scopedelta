import { apiData, apiError, readJson } from "@/lib/api";
import { createClientInvitationSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientInvitationEmail } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  inviteClientParticipant,
  listClientParticipants,
} from "@/server/client-collaboration";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    return apiData(await listClientParticipants(actor, workspaceId, projectId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createClientInvitationSchema,
      await readJson(request),
    );
    const invitation = await inviteClientParticipant(
      actor,
      workspaceId,
      projectId,
      input,
    );
    if (invitation.delivery) {
      scheduleClientInvitationEmail(
        invitation.delivery.to,
        invitation.delivery.projectName,
        invitation.delivery.token,
        invitation.id,
      );
    }
    return apiData(
      {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        fragmentPath: invitation.fragmentPath,
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
