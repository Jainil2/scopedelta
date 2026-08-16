import { z } from "zod";

export const startCheckoutSchema = z.object({
  planKey: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  idempotencyKey: z.uuid(),
});
