import { pathToFileURL } from "node:url";

import { getAiConfig } from "../src/lib/env";

function normalizedValue(value: string | undefined) {
  return value?.trim() || null;
}

export function releaseEnvironmentReadiness() {
  let aiEnabled =
    normalizedValue(process.env.AI_ENABLED)?.toLowerCase() === "true";
  let aiProvider = normalizedValue(process.env.AI_PROVIDER) || "ollama";
  let aiModel = normalizedValue(process.env.AI_MODEL);
  let aiConfigurationValid = true;

  try {
    const config = getAiConfig();
    aiEnabled = config.enabled;
    aiProvider = config.provider;
    aiModel = config.model || null;
  } catch {
    aiConfigurationValid = false;
  }

  const judgeEmail = normalizedValue(process.env.WEBMCP_DEMO_JUDGE_EMAIL);
  const judgePassword = process.env.WEBMCP_DEMO_JUDGE_PASSWORD ?? "";

  return {
    ai_enabled: aiEnabled,
    ai_configuration_valid: aiConfigurationValid,
    ai_provider: aiProvider,
    ai_model: aiModel,
    gemini_key_configured: Boolean(normalizedValue(process.env.GEMINI_API_KEY)),
    webmcp_demo_enabled:
      process.env.WEBMCP_DEMO_ENABLE === "webmcp-challenge-2026",
    judge_credential_configured: Boolean(
      judgeEmail && judgePassword.length >= 16 && judgePassword.length <= 128,
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.stdout.write(`${JSON.stringify(releaseEnvironmentReadiness())}\n`);
}
