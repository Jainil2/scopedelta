import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getAuthSecret } from "@/lib/env";
import { notFound } from "@/lib/platform-errors";

const STATE_LIFETIME_MS = 10 * 60 * 1_000;

type InstallationState = {
  version: 1;
  phase: "setup" | "oauth";
  workspaceId: string;
  projectId: string;
  userId: string;
  repositoryFullName: string;
  returnPath: string;
  installationId: string | null;
  expiresAt: number;
  nonce: string;
};

function signature(payload: string) {
  return createHmac("sha256", getAuthSecret())
    .update(`github-installation:${payload}`)
    .digest("base64url");
}

export function createGitHubInstallationState(
  input: Omit<InstallationState, "version" | "expiresAt" | "nonce">,
) {
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      ...input,
      expiresAt: Date.now() + STATE_LIFETIME_MS,
      nonce: randomBytes(24).toString("base64url"),
    } satisfies InstallationState),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyGitHubInstallationState(
  value: string,
  expectedPhase: InstallationState["phase"],
  userId: string,
) {
  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) throw notFound();
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw notFound();
  }
  let state: InstallationState;
  try {
    state = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as InstallationState;
  } catch {
    throw notFound();
  }
  if (
    state.version !== 1 ||
    state.phase !== expectedPhase ||
    state.userId !== userId ||
    state.expiresAt <= Date.now() ||
    !state.nonce ||
    !state.returnPath.startsWith("/app/") ||
    state.returnPath.includes("\\") ||
    state.returnPath.includes("//")
  ) {
    throw notFound();
  }
  return state;
}
