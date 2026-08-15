import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { resultSchemas } from "../src/lib/ai/contracts";
import { getAiConfig } from "../src/lib/env";
import { createAiProvider } from "../src/server/ai/provider";

const cases = [
  ["scope_change_analysis", "scope-change-analysis.json"],
  ["delivery_risk_brief", "delivery-risk-brief.json"],
  ["work_context_qa_pack", "work-context-qa-pack.json"],
] as const;

const config = getAiConfig();
if (!config.enabled) {
  throw new Error(
    "Set AI_ENABLED=true and explicitly configure AI_PROVIDER and AI_MODEL.",
  );
}
const provider = createAiProvider(config);
let failures = 0;

for (const [kind, filename] of cases) {
  const context = JSON.parse(
    await readFile(resolve("fixtures/ai", filename), "utf8"),
  ) as unknown;
  try {
    const generation = await provider.generate({
      schemaName: kind,
      schema: z.toJSONSchema(resultSchemas[kind]) as Record<string, unknown>,
      system:
        "Use only supplied synthetic evidence. Cite supplied evidence keys and return the required structured output.",
      prompt: JSON.stringify(context),
    });
    resultSchemas[kind].parse(generation.output);
    process.stdout.write(
      `PASS ${kind} (${generation.usage.inputTokens ?? "?"} input / ${generation.usage.outputTokens ?? "?"} output tokens)\n`,
    );
  } catch (error) {
    failures += 1;
    process.stderr.write(
      `FAIL ${kind}: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
  }
}

if (failures) process.exitCode = 1;
