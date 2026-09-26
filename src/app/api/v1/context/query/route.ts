import { buildContextFeed } from "@/domain/context-feed";
import { fetchAirNowObservations, type AirNowResult } from "@/server/airnow";
import { fetchCalFireIncidents } from "@/server/calfire";
import { fetchNifcPerimeters } from "@/server/nifc";
import { PRIVATE_HEADERS as PRIVATE, readPlaceQuery } from "@/server/place-query";
import { demoLiveSourcesEnabled, pausedSourceResponse } from "@/server/live-query-gate";

export const runtime = "nodejs";

/** Search radius for nearby fire context. A fixed policy value, not a safety distance. */
const RADIUS_KM = 80;

/**
 * Fire and air-quality context near a point: CAL FIRE incidents, NIFC perimeters and
 * AirNow observations. Each source reports its own status; one outage never hides
 * another, and no combination of results is an evacuation status or all-clear.
 */
export async function POST(request: Request): Promise<Response> {
  const input = await readPlaceQuery(request);
  if ("error" in input) return input.error;
  if (!demoLiveSourcesEnabled()) return pausedSourceResponse(PRIVATE);
  const { point } = input.query;
  const generatedAt = new Date().toISOString();
  const apiKey = process.env.AIRNOW_API_KEY?.trim();

  const [calfire, nifc, airnow] = await Promise.all([
    fetchCalFireIncidents(),
    fetchNifcPerimeters({ point, radiusKm: RADIUS_KM }),
    apiKey
      ? fetchAirNowObservations({ point, apiKey }).catch((): AirNowResult => ({
          status: "unavailable", sourceUrl: "https://www.airnowapi.org/", attemptedAt: new Date().toISOString(),
          reason: "invalid_response",
        }))
      : Promise.resolve("not-configured" as const),
  ]);

  try {
    const feed = buildContextFeed({ point, radiusKm: RADIUS_KM, generatedAt, calfire, nifc, airnow });
    const anyOk = feed.sourceChecks.some((source) => source.status === "ok");
    return Response.json(feed, { status: anyOk ? 200 : 503, headers: PRIVATE });
  } catch {
    // Normalization failure: report unavailability rather than an empty feed.
    return Response.json({ error: "Context sources could not be summarized" }, { status: 503, headers: PRIVATE });
  }
}
