import { runOperationsAlerts } from "../../src/server/operations-alerts";

const handler = async () => {
  const result = await runOperationsAlerts();
  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};

export default handler;

export const config = { schedule: "*/15 * * * *" };
