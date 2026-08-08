import { apiData, apiError, readJson } from "@/lib/api";
import { parseInput, updateMemberSchema } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/server/workspaces";

type Context = {
  params: Promise<{ workspaceId: string; membershipId: string }>;
};

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, membershipId } = await context.params;
    const input = parseInput(updateMemberSchema, await readJson(request));
    return apiData(
      await updateWorkspaceMemberRole(
        actor,
        workspaceId,
        membershipId,
        input.role,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, membershipId } = await context.params;
    return apiData(
      await removeWorkspaceMember(actor, workspaceId, membershipId),
    );
  } catch (error) {
    return apiError(error);
  }
}
