import { z } from "zod";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { GLENDALE_CITY_HALL } from "./data/glendale";
import type { LatLng } from "./types";

/*
 * Manual-location fallback: Mapbox Geocoding v6, limited to a box around Glendale. It runs only
 * when the person submits the form, and the typed text is sent to Mapbox. Results are Mapbox
 * "temporary" geocodes: used for this route, never stored.
 */
const MAPBOX_FORWARD = "https://api.mapbox.com/search/geocode/v6/forward";
/** Glendale and neighbors (min lng, min lat, max lng, max lat). */
const GLENDALE_BBOX = "-118.40,34.08,-118.13,34.28";

const GeocodeSchema = z.object({
  features: z.array(z.object({
    geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
    properties: z.object({ name: z.string(), place_formatted: z.string().optional() }),
  })),
});

export type GeocodeResult = LatLng & { label: string };

export async function geocode(
  query: string,
  { token = MAPBOX_TOKEN, fetcher = (input, init) => fetch(input, init), signal }:
    { token?: string; fetcher?: typeof fetch; signal?: AbortSignal } = {},
): Promise<GeocodeResult | null> {
  const text = query.trim();
  if (!text) return null;
  if (!token) throw new Error("Address search is not configured");
  const url = new URL(MAPBOX_FORWARD);
  url.search = new URLSearchParams({
    q: text,
    country: "us",
    limit: "1",
    bbox: GLENDALE_BBOX,
    proximity: `${GLENDALE_CITY_HALL.lng},${GLENDALE_CITY_HALL.lat}`,
    access_token: token,
  }).toString();
  const response = await fetchWithTimeout(fetcher, url, { headers: { Accept: "application/json" }, signal }, 10_000);
  if (!response.ok) throw new Error(`Address lookup failed (HTTP ${response.status})`);
  const parsed = GeocodeSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Unexpected address lookup response");
  const match = parsed.data.features[0];
  if (!match) return null;
  const [lng, lat] = match.geometry.coordinates;
  const { name, place_formatted: place } = match.properties;
  // "1613 Glencoe Way" + "Glendale, California 91208, United States" → "1613 Glencoe Way, Glendale"
  const locality = place?.split(",")[0]?.trim();
  return { lat, lng, label: locality && locality !== name ? `${name}, ${locality}` : name };
}
