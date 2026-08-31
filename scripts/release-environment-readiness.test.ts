import { afterEach, describe, expect, it } from "vitest";

import { releaseEnvironmentReadiness } from "./release-environment-readiness";

const originalEnvironment = process.env;

afterEach(() => {
  process.env = originalEnvironment;
});

function environment(values: Record<string, string | undefined>) {
  process.env = { ...originalEnvironment, ...values };
}

describe("releaseEnvironmentReadiness", () => {
  it("uses the runtime's trim and case semantics for valid Gemini config", () => {
    environment({
      AI_ENABLED: " TRUE ",
      AI_PROVIDER: " gemini ",
      AI_MODEL: " gemini-2.5-flash ",
      GEMINI_API_KEY: " protected-key ",
    });

    expect(releaseEnvironmentReadiness()).toMatchObject({
      ai_enabled: true,
      ai_configuration_valid: true,
      ai_provider: "gemini",
      ai_model: "gemini-2.5-flash",
      gemini_key_configured: true,
    });
  });

  it("treats blank provider, model, and key values like the runtime", () => {
    environment({
      AI_ENABLED: " false ",
      AI_PROVIDER: "   ",
      AI_MODEL: "   ",
      GEMINI_API_KEY: "   ",
    });

    expect(releaseEnvironmentReadiness()).toMatchObject({
      ai_enabled: false,
      ai_configuration_valid: true,
      ai_provider: "ollama",
      ai_model: null,
      gemini_key_configured: false,
    });
  });

  it("reports invalid runtime config without inventing effective values", () => {
    environment({
      AI_ENABLED: " true ",
      AI_PROVIDER: " GEMINI ",
      AI_MODEL: "   ",
      GEMINI_API_KEY: "   ",
    });

    expect(releaseEnvironmentReadiness()).toMatchObject({
      ai_enabled: true,
      ai_configuration_valid: false,
      ai_provider: "GEMINI",
      ai_model: null,
      gemini_key_configured: false,
    });
  });

  it("rejects blank demo credentials while accepting normalized email input", () => {
    environment({
      WEBMCP_DEMO_JUDGE_EMAIL: "   ",
      WEBMCP_DEMO_JUDGE_PASSWORD: "                ",
    });
    expect(releaseEnvironmentReadiness().judge_credential_configured).toBe(
      false,
    );

    environment({
      WEBMCP_DEMO_JUDGE_EMAIL: " judge@challenge.test ",
      WEBMCP_DEMO_JUDGE_PASSWORD: "protected-password",
    });
    expect(releaseEnvironmentReadiness().judge_credential_configured).toBe(
      true,
    );
  });
});
