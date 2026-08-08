import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/lib/env";

async function main() {
  const pool = new Pool({
    connectionString: getDatabaseUrl("migration"),
    max: 1,
  });

  try {
    await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
    process.stdout.write("Database migrations applied.\n");
  } finally {
    await pool.end();
  }
}

void main();
