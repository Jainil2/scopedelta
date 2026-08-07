import { apiData, apiError, readJson } from "@/lib/api";
import { scheduleWorkspaceInvitationEmail } from "@/lib/email";
import { inviteMemberSchema, parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { inviteWorkspaceMember } from "@/server/workspaces";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await context.params;
    const input = parseInput(inviteMemberSchema, await readJson(request));
    const invitation = await inviteWorkspaceMember(actor, workspaceId, input);
    scheduleWorkspaceInvitationEmail(
      invitation.delivery.to,
      invitation.delivery.workspaceName,
      invitation.delivery.token,
    );
    return apiData(
      {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
