import { handlePurgeExpired, jsonError, requireReportingPreview } from "@/server/observations";
import { createPostgresObservationStore } from "@/server/observations-postgres";

export const runtime = "nodejs";

/** Protected scheduled/manual purge for expired raw reports. Vercel Cron runs on Production only, so use an external scheduler that can reach protected Preview or run this manually. */
export async function POST(request: Request): Promise<Response> {
  const gate = requireReportingPreview();
  if (gate) return gate;
  const store = createPostgresObservationStore();
  if (!store) return jsonError("Community reporting database is not configured", 503);
  try { return await handlePurgeExpired(request, store); }
  catch { return jsonError("Expired report purge is unavailable", 503); }
}
