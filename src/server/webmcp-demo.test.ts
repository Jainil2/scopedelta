import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  formatWebMcpDemoFailure,
  readWebMcpDemoConfig,
  runWebMcpDemoCommand,
  WEBMCP_DEMO_ENABLE_VALUE,
  WebMcpDemoError,
} from "@/server/webmcp-demo";

const validJudgeEmail = `unit-${randomUUID()}@challenge.test`;
const validJudgeInput = ["unit", "fixture", "only", "input"].join("-");
const validEnvironment = {
  NODE_ENV: "test",
  WEBMCP_DEMO_ENABLE: WEBMCP_DEMO_ENABLE_VALUE,
  WEBMCP_DEMO_JUDGE_EMAIL: validJudgeEmail,
  WEBMCP_DEMO_JUDGE_PASSWORD: validJudgeInput,
} satisfies NodeJS.ProcessEnv;

describe("WebMCP demo command safeguards", () => {
  it("accepts only the explicit enable marker and private fixture credentials", () => {
    expect(readWebMcpDemoConfig(validEnvironment)).toEqual({
      judgeEmail: validJudgeEmail,
      judgePassword: validJudgeInput,
    });
  });

  it.each([
    [{ ...validEnvironment, WEBMCP_DEMO_ENABLE: "yes" }, "demo_disabled"],
    [
      { ...validEnvironment, WEBMCP_DEMO_JUDGE_EMAIL: "judge@example.com" },
      "invalid_judge_email",
    ],
    [
      { ...validEnvironment, WEBMCP_DEMO_JUDGE_PASSWORD: "too-short" },
      "invalid_judge_password",
    ],
    [
      {
        ...validEnvironment,
        WEBMCP_DEMO_JUDGE_PASSWORD: "x".repeat(129),
      },
      "invalid_judge_password",
    ],
  ])("rejects unsafe configuration", (environment, code) => {
    expect(() => readWebMcpDemoConfig(environment)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it("formats CLI failures without echoing credentials or error details", () => {
    const privatePassword = validEnvironment.WEBMCP_DEMO_JUDGE_PASSWORD;
    const known = formatWebMcpDemoFailure(
      new WebMcpDemoError("reset_not_confirmed", privatePassword),
    );
    const unknown = formatWebMcpDemoFailure(
      new Error(`database failed near ${privatePassword}`),
    );

    expect(known).toBe("webmcp_demo_failed:reset_not_confirmed");
    expect(unknown).toBe("webmcp_demo_failed:unexpected_error");
    expect(`${known}\n${unknown}`).not.toContain(privatePassword);
  });

  it("refuses to mutate before the existing platform auth secret is configured", async () => {
    await expect(
      runWebMcpDemoCommand("seed", validEnvironment),
    ).rejects.toMatchObject({ code: "platform_auth_unconfigured" });
  });
});
