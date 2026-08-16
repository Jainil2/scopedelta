import { getPool } from "@/db";
import { listOperatorEconomics } from "@/server/billing";

async function main() {
  try {
    const rows = await listOperatorEconomics();
    process.stdout.write(
      `${JSON.stringify({ generatedAt: new Date(), rows }, null, 2)}\n`,
    );
  } finally {
    await getPool().end();
  }
}

void main().catch(() => {
  process.stderr.write("billing_economics_failed\n");
  process.exitCode = 1;
});
