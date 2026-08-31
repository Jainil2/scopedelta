const readiness = {
  ai_enabled: process.env.AI_ENABLED === "true",
  ai_provider: process.env.AI_PROVIDER || null,
  ai_model: process.env.AI_MODEL || null,
  gemini_key_configured: Boolean(process.env.GEMINI_API_KEY),
  webmcp_demo_enabled:
    process.env.WEBMCP_DEMO_ENABLE === "webmcp-challenge-2026",
  judge_credential_configured:
    Boolean(process.env.WEBMCP_DEMO_JUDGE_EMAIL) &&
    Boolean(process.env.WEBMCP_DEMO_JUDGE_PASSWORD),
};

process.stdout.write(`${JSON.stringify(readiness)}\n`);
