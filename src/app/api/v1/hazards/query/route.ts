import { buildHazardFeed } from "@/domain/hazard-feed";
import { fetchGlendaleHazards, GLENDALE_GIS_DEFAULT_URL, type GisHazardsResult } from "@/server/glendale-gis";
import { PRIVATE_HEADERS as PRIVATE, readPlaceQuery } from "@/server/place-query";

export const runtime = "nodejs";

/**
 * Mapped hazard designations (fire hazard severity, flood, seismic, dam inundation,
 * debris flow) at a point, from the Glendale GIS MCP snapshot. Reference maps only:
 * not current conditions, an evacuation zone, or a property safety rating.
 */
export async function POST(request: Request): Promise<Response> {
  const input = await readPlaceQuery(request);
  if ("error" in input) return input.error;
  const generatedAt = new Date().toISOString();
  const apiKey = process.env.GLENDALE_GIS_MCP_KEY?.trim();
  const url = process.env.GLENDALE_GIS_MCP_URL?.trim() || GLENDALE_GIS_DEFAULT_URL;
  if (!apiKey) return Response.json(buildHazardFeed("not-configured", generatedAt), { status: 503, headers: PRIVATE });

  const result = await fetchGlendaleHazards({ point: input.query.point, apiKey, url }).catch((): GisHazardsResult => ({
    status: "unavailable", attemptedAt: new Date().toISOString(), reason: "invalid_response",
  }));
  try {
    const feed = buildHazardFeed(result, generatedAt);
    return Response.json(feed, { status: result.status === "ok" ? 200 : 503, headers: PRIVATE });
  } catch {
    return Response.json({ error: "Hazard maps could not be summarized" }, { status: 503, headers: PRIVATE });
  }
}
