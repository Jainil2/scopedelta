import { afterEach, describe, expect, it } from "vitest";

import {
  createGitHubInstallationState,
  verifyGitHubInstallationState,
} from "@/server/github-installation-state";

const originalEnv = { ...process.env };

describe("GitHub installation authorization state", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("binds a signed state to its phase, workspace context, and initiating user", () => {
    process.env.BETTER_AUTH_SECRET =
      "github-installation-state-test-secret-value";
    const state = createGitHubInstallationState({
      phase: "oauth",
      workspaceId: "workspace-a",
      projectId: "project-a",
      userId: "user-a",
      repositoryFullName: "customer/private-delivery",
      returnPath: "/app/customer/projects/AUTH/engineering",
      installationId: "4242424242",
    });

    expect(
      verifyGitHubInstallationState(state, "oauth", "user-a"),
    ).toMatchObject({
      workspaceId: "workspace-a",
      projectId: "project-a",
      repositoryFullName: "customer/private-delivery",
      installationId: "4242424242",
    });
    expect(() =>
      verifyGitHubInstallationState(state, "oauth", "user-b"),
    ).toThrow();
    expect(() =>
      verifyGitHubInstallationState(`${state}tampered`, "oauth", "user-a"),
    ).toThrow();
    expect(() =>
      verifyGitHubInstallationState(state, "setup", "user-a"),
    ).toThrow();
  });
});
