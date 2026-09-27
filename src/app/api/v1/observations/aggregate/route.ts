import { handleGetAggregate, jsonError, requireReportingPreview } from "@/server/observations";
import { createPostgresObservationStore } from "@/server/observations-postgres";

export const runtime = "nodejs";

/** Public output is only coarse, moderated, unverified cells. It never exposes raw ids, points or times. */
export async function GET(): Promise<Response> {
  const gate = requireReportingPreview();
  if (gate) return gate;
  const store = createPostgresObservationStore();
  if (!store) return jsonError("Community reporting database is not configured", 503);
  try { return await handleGetAggregate(store); }
  catch { return jsonError("Community observation aggregate is unavailable", 503); }
}
