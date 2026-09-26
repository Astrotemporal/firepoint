import { asNwsNoticeFeed, unconfiguredNwsFeed } from "@/domain/notice-feed";
import { fetchNwsActiveAlerts } from "@/server/nws";
import { PRIVATE_HEADERS as PRIVATE, readPlaceQuery } from "@/server/place-query";
import { demoLiveSourcesEnabled, pausedSourceResponse } from "@/server/live-query-gate";

export const runtime = "nodejs";

/** Point query only. This route knows NWS weather alerts, not evacuation orders. */
export async function POST(request: Request): Promise<Response> {
  const input = await readPlaceQuery(request);
  if ("error" in input) return input.error;
  if (!demoLiveSourcesEnabled()) return pausedSourceResponse(PRIVATE);
  const generatedAt = new Date().toISOString();
  const userAgent = process.env.NWS_USER_AGENT?.trim();
  if (!userAgent) {
    return Response.json(unconfiguredNwsFeed(generatedAt), { status: 503, headers: PRIVATE });
  }
  try {
    const [longitude, latitude] = input.query.point;
    const result = await fetchNwsActiveAlerts({ latitude, longitude, userAgent });
    const feed = asNwsNoticeFeed(result, generatedAt);
    return Response.json(feed, { status: result.status === "ok" ? 200 : 503, headers: PRIVATE });
  } catch {
    // Configuration, upstream shape or normalization failure: never convert to zero alerts.
    const feed = asNwsNoticeFeed({
      status: "unavailable", sourceUrl: "https://api.weather.gov/alerts/active",
      attemptedAt: new Date().toISOString(), pointFiltered: true, reason: "invalid_response",
    }, generatedAt);
    return Response.json(feed, { status: 503, headers: PRIVATE });
  }
}
