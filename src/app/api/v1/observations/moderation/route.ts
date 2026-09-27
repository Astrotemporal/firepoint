import { handleListPending, handleModerateObservation, jsonError, requireReportingPreview } from "@/server/observations";
import { createPostgresObservationStore } from "@/server/observations-postgres";

export const runtime = "nodejs";

/** Protected moderator queue. Requires FIREPOINT_MODERATOR_TOKEN; not a public endpoint. */
export async function GET(request: Request): Promise<Response> {
  const gate = requireReportingPreview();
  if (gate) return gate;
  const store = createPostgresObservationStore();
  if (!store) return jsonError("Community reporting database is not configured", 503);
  try { return await handleListPending(request, store); }
  catch { return jsonError("Moderation queue is unavailable", 503); }
}

export async function POST(request: Request): Promise<Response> {
  const gate = requireReportingPreview();
  if (gate) return gate;
  const store = createPostgresObservationStore();
  if (!store) return jsonError("Community reporting database is not configured", 503);
  try { return await handleModerateObservation(request, store); }
  catch { return jsonError("Moderation decision could not be saved", 503); }
}
