import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { actionRateLimits } from "@/db/schema";
import { getAuthSecret } from "@/lib/env";
import { PlatformError } from "@/lib/platform-errors";

export async function consumeActionLimit(
  keySource: string,
  maximum: number,
  windowSeconds: number,
) {
  const key = createHmac("sha256", getAuthSecret())
    .update(keySource)
    .digest("hex");
  const result = await getDb().execute<{ count: number }>(sql`
    insert into ${actionRateLimits} (key, count, window_started_at, expires_at)
    values (${key}, 1, now(), now() + (${windowSeconds} * interval '1 second'))
    on conflict (key) do update set
      count = case
        when ${actionRateLimits.expiresAt} <= now() then 1
        else ${actionRateLimits.count} + 1
      end,
      window_started_at = case
        when ${actionRateLimits.expiresAt} <= now() then now()
        else ${actionRateLimits.windowStartedAt}
      end,
      expires_at = case
        when ${actionRateLimits.expiresAt} <= now()
          then now() + (${windowSeconds} * interval '1 second')
        else ${actionRateLimits.expiresAt}
      end
    returning count
  `);
  if (Number(result.rows[0]?.count ?? 0) > maximum) {
    throw new PlatformError(
      "rate_limited",
      429,
      "Too many requests. Try again later.",
    );
  }
}
