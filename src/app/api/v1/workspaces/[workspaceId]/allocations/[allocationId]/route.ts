import { apiData, apiError, readJson } from "@/lib/api";
import { updateAllocationSchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { deleteAllocation, updateAllocation } from "@/server/operations";

type Context = {
  params: Promise<{ workspaceId: string; allocationId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, allocationId } = await params;
    const input = parseInput(updateAllocationSchema, await readJson(request));
    return apiData(
      await updateAllocation(actor, workspaceId, allocationId, input),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, allocationId } = await params;
    return apiData(await deleteAllocation(actor, workspaceId, allocationId));
  } catch (error) {
    return apiError(error);
  }
}
