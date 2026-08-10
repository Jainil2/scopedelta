import { cookies } from "next/headers";

import { apiData, apiError, readJson } from "@/lib/api";
import { stageClientInvitationSchema } from "@/lib/client-collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireSameOrigin } from "@/server/api-auth";
import { consumeActionLimit } from "@/server/action-rate-limit";
import { verifyClientInvitationToken } from "@/server/client-collaboration";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = parseInput(
      stageClientInvitationSchema,
      await readJson(request),
    );
    await consumeActionLimit(
      `client-invite-stage:${request.headers.get("x-forwarded-for") ?? "local"}`,
      30,
      60 * 60,
    );
    await verifyClientInvitationToken(input.token);
    const cookieStore = await cookies();
    cookieStore.set("scopedelta_client_invitation", input.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/client/invitations/accept",
      maxAge: 10 * 60,
    });
    return apiData({ staged: true });
  } catch (error) {
    return apiError(error);
  }
}
