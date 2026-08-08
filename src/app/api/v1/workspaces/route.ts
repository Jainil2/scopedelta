import { apiData, apiError, readJson } from "@/lib/api";
import { createWorkspaceSchema, parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createWorkspace, listWorkspaces } from "@/server/workspaces";

export async function GET(request: Request) {
  try {
    return apiData(await listWorkspaces(await requireApiActor(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireApiActor(request);
    const input = parseInput(createWorkspaceSchema, await readJson(request));
    return apiData(await createWorkspace(actor, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
