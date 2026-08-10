import { apiData, apiError, readJson } from "@/lib/api";
import { reissueClientInvitationSchema } from "@/lib/client-collaboration-validation";
import { scheduleClientInvitationEmail } from "@/lib/email";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { reissueClientInvitation } from "@/server/client-collaboration";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    invitationId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, invitationId } = await params;
    const input = parseInput(
      reissueClientInvitationSchema,
      await readJson(request),
    );
    const invitation = await reissueClientInvitation(
      actor,
      workspaceId,
      projectId,
      invitationId,
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
    return apiData({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      fragmentPath: invitation.fragmentPath,
    });
  } catch (error) {
    return apiError(error);
  }
}
