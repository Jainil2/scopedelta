import { apiData, apiError, readJson } from "@/lib/api";
import {
  scheduleWorkspaceInvitationEmail,
  workspaceInvitationUrl,
} from "@/lib/email";
import {
  inviteMemberSchema,
  parseInput,
  workspaceDirectoryFiltersSchema,
} from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  inviteWorkspaceMember,
  listWorkspaceMembers,
} from "@/server/workspaces";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await context.params;
    const filters = parseInput(
      workspaceDirectoryFiltersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const directory = await listWorkspaceMembers(actor, workspaceId, filters);
    return apiData({
      items: directory.invitations,
      page: directory.invitationPage,
    });
  } catch (error) {
    return apiError(error);
  }
}

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
      invitation.id,
      workspaceId,
    );
    return apiData(
      {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        acceptUrl: workspaceInvitationUrl(invitation.delivery.token),
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
