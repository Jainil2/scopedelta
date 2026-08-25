import { z } from "zod";

import { processWorkspaceLifecycle } from "../src/server/lifecycle-processing";

const argumentSchema = z.object({
  operatorId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  action: z.enum(["inspect", "start-review", "block", "process", "purge"]),
});

function readArguments(argv: string[]) {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || !value) throw new Error("lifecycle_arguments_invalid");
    values[key] = value;
  }
  return argumentSchema.parse({
    operatorId: values["operator-id"],
    workspaceId: values["workspace-id"],
    requestId: values["request-id"],
    action: values.action,
  });
}

async function main() {
  const result = await processWorkspaceLifecycle(
    readArguments(process.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main();
