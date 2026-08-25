import { getPool } from "@/db";
import { listOperatorSignals } from "@/server/self-service";

function requestedLimit() {
  const argument = process.argv.find((value) => value.startsWith("--limit="));
  const parsed = Number(argument?.slice("--limit=".length) ?? 100);
  return Number.isInteger(parsed) ? parsed : 100;
}

async function main() {
  try {
    const signals = await listOperatorSignals(requestedLimit());
    process.stdout.write(
      `${JSON.stringify({ generatedAt: new Date(), signals }, null, 2)}\n`,
    );
  } finally {
    await getPool().end();
  }
}

void main().catch(() => {
  process.stderr.write("operations_signals_failed\n");
  process.exitCode = 1;
});
