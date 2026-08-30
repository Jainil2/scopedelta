import { getPool } from "@/db";
import {
  formatWebMcpDemoFailure,
  runWebMcpDemoCommand,
  WebMcpDemoError,
  type WebMcpDemoCommand,
} from "@/server/webmcp-demo";

const command = process.argv[2] as WebMcpDemoCommand | undefined;

async function main() {
  try {
    if (command !== "seed" && command !== "verify" && command !== "reset") {
      throw new WebMcpDemoError(
        "invalid_command",
        "Use seed, verify, or reset.",
      );
    }
    const result = await runWebMcpDemoCommand(command);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${formatWebMcpDemoFailure(error)}\n`);
    process.exitCode = 1;
  } finally {
    if (process.env.DATABASE_URL?.trim()) {
      await getPool().end();
    }
  }
}

void main();
