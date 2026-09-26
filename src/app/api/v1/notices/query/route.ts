import { PlaceQuerySchema } from "@/domain/contracts";
import { asNwsNoticeFeed, unconfiguredNwsFeed } from "@/domain/notice-feed";
import { fetchNwsActiveAlerts } from "@/server/nws";

export const runtime = "nodejs";
const PRIVATE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** Point query only. This route knows NWS weather alerts, not evacuation orders. */
export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "JSON body required" }, { status: 415, headers: PRIVATE });
  }
  if (Number(request.headers.get("content-length")) > 1024) {
    return Response.json({ error: "Body too large" }, { status: 413, headers: PRIVATE });
  }
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > 1024) return Response.json({ error: "Body too large" }, { status: 413, headers: PRIVATE });
    payload = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: PRIVATE });
  }
  const parsed = PlaceQuerySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Invalid point or missing user action" }, { status: 400, headers: PRIVATE });
  }
  const generatedAt = new Date().toISOString();
  const userAgent = process.env.NWS_USER_AGENT?.trim();
  if (!userAgent) {
    return Response.json(unconfiguredNwsFeed(generatedAt), { status: 503, headers: PRIVATE });
  }
  try {
    const [longitude, latitude] = parsed.data.point;
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
