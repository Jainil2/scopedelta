import { apiData, apiError, readJson } from "@/lib/api";
import {
  onboardingPreferenceSchema,
  parseInput,
} from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  getWorkspaceOnboarding,
  setWorkspaceOnboardingDismissed,
} from "@/server/self-service";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    return apiData(
      await getWorkspaceOnboarding(await requireApiActor(request), workspaceId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await context.params;
    const input = parseInput(
      onboardingPreferenceSchema,
      await readJson(request),
    );
    return apiData(
      await setWorkspaceOnboardingDismissed(
        actor,
        workspaceId,
        input.dismissed,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
