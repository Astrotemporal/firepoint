import { handleSubmitObservation, jsonError, requireReportingPreview } from "@/server/observations";
import { createPostgresObservationStore } from "@/server/observations-postgres";

export const runtime = "nodejs";

/** Explicit resident submission only. Private FireMarks are never read or uploaded by this route. */
export async function POST(request: Request): Promise<Response> {
  const gate = requireReportingPreview();
  if (gate) return gate;
  const store = createPostgresObservationStore();
  if (!store) return jsonError("Community reporting database is not configured", 503);
  try { return await handleSubmitObservation(request, store); }
  catch { return jsonError("Community reporting is unavailable", 503); }
}
