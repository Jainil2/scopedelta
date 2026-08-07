import { cookies } from "next/headers";

import { apiData, apiError, readJson } from "@/lib/api";
import { invitationTokenSchema, parseInput } from "@/lib/platform-validation";
import { verifyInvitationToken } from "@/server/workspaces";
import { requireSameOrigin } from "@/server/api-auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = parseInput(invitationTokenSchema, await readJson(request));
    await verifyInvitationToken(input.token);
    const cookieStore = await cookies();
    cookieStore.set("scopedelta_invitation", input.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/invitations/accept",
      maxAge: 10 * 60,
    });
    return apiData({ staged: true });
  } catch (error) {
    return apiError(error);
  }
}
