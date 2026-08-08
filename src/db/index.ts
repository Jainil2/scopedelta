import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseUrl } from "@/lib/env";

import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & {
  scopeDeltaPool?: Pool;
};

export function getPool() {
  if (!globalDatabase.scopeDeltaPool) {
    globalDatabase.scopeDeltaPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: process.env.NODE_ENV === "production" ? 5 : 10,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return globalDatabase.scopeDeltaPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Database = ReturnType<typeof getDb>;
