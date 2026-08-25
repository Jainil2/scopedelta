import { apiData, apiError } from "@/lib/api";
import {
  scheduleWorkspaceInvitationEmail,
  workspaceInvitationUrl,
} from "@/lib/email";
import { requireApiActor } from "@/server/api-auth";
import { reissueWorkspaceInvitation } from "@/server/workspaces";

type Context = {
  params: Promise<{ workspaceId: string; invitationId: string }>;
};

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, invitationId } = await context.params;
    const invitation = await reissueWorkspaceInvitation(
      actor,
      workspaceId,
      invitationId,
    );
    scheduleWorkspaceInvitationEmail(
      invitation.delivery.to,
      invitation.delivery.workspaceName,
      invitation.delivery.token,
      invitation.id,
      workspaceId,
    );
    return apiData({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      acceptUrl: workspaceInvitationUrl(invitation.delivery.token),
    });
  } catch (error) {
    return apiError(error);
  }
}
