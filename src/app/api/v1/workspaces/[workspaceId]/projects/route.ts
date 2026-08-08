import { apiData, apiError, readJson } from "@/lib/api";
import {
  createProjectSchema,
  paginationSchema,
} from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createProject, listProjects } from "@/server/delivery";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const pagination = parseInput(
      paginationSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listProjects(
        actor,
        workspaceId,
        pagination.page,
        pagination.pageSize,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(createProjectSchema, await readJson(request));
    return apiData(await createProject(actor, workspaceId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
