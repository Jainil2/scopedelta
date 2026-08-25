import { runOperationsAlerts } from "../src/server/operations-alerts";

async function main() {
  const result = await runOperationsAlerts();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.outboundAttempted && "delivered" in result && !result.delivered) {
    process.exitCode = 1;
  }
}

void main();
