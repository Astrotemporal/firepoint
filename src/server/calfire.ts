import { z } from "zod";
import { fetchJson, type FetchFailure, type FetchJsonOptions } from "./fetch-json";

/** CAL FIRE's public incident list. Location and containment are not proof of safety. */
export const CALFIRE_INCIDENTS_URL = "https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=false";
const CALFIRE_INCIDENTS_PAGE = "https://www.fire.ca.gov/incidents";

const text = z.string().nullable().optional();
const incidentSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]).rest(z.number()) }),
  properties: z.object({
    UniqueId: z.string().min(1),
    Name: z.string().min(1),
    Updated: text,
    Started: text,
    County: text,
    Location: text,
    Type: text,
    Url: text,
    AcresBurned: z.number().nullable().optional(),
    PercentContained: z.number().nullable().optional(),
    IsActive: z.boolean(),
    Final: z.boolean(),
  }),
});
const collectionSchema = z.object({ type: z.literal("FeatureCollection"), features: z.array(incidentSchema) });

export type CalFireIncident = {
  id: string;
  name: string;
  point: [number, number];
  incidentType: string | null;
  county: string | null;
  locationDescription: string | null;
  acresBurned: number | null;
  percentContained: number | null;
  startedAt: string | null;
  updatedAt: string | null;
  url: string;
};

export type CalFireResult =
  | { status: "ok"; sourceUrl: string; checkedAt: string; incidents: CalFireIncident[] }
  | { status: "unavailable"; sourceUrl: string; attemptedAt: string; reason: FetchFailure; httpStatus?: number };

/** Publisher timestamps that fail to parse stay unknown rather than being replaced. */
export function isoOrNull(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function incidentUrl(value: string | null | undefined): string {
  try {
    const url = new URL(value ?? "");
    if (url.protocol === "https:" && url.hostname.endsWith("fire.ca.gov")) return url.toString();
  } catch { /* fall through to the publisher's incident index */ }
  return CALFIRE_INCIDENTS_PAGE;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Fetch every active incident CAL FIRE lists statewide. Distance filtering happens
 * on our server so a resident's point is never sent to this publisher.
 */
export async function fetchCalFireIncidents(
  { now = () => new Date(), ...options }: FetchJsonOptions & { now?: () => Date } = {},
): Promise<CalFireResult> {
  const result = await fetchJson(CALFIRE_INCIDENTS_URL, { ...options, headers: { Accept: "application/json" } });
  const failed = (reason: FetchFailure, httpStatus?: number): CalFireResult => ({
    status: "unavailable", sourceUrl: CALFIRE_INCIDENTS_URL, attemptedAt: now().toISOString(), reason,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  });
  if (!result.ok) return failed(result.reason, result.httpStatus);
  const parsed = collectionSchema.safeParse(result.data);
  if (!parsed.success) return failed("invalid_response");
  return {
    status: "ok",
    sourceUrl: CALFIRE_INCIDENTS_URL,
    checkedAt: now().toISOString(),
    incidents: parsed.data.features
      .filter(({ properties }) => properties.IsActive && !properties.Final)
      .map(({ geometry, properties: p }) => ({
        id: p.UniqueId,
        name: p.Name.trim(),
        point: [geometry.coordinates[0], geometry.coordinates[1]],
        incidentType: clean(p.Type),
        county: clean(p.County),
        locationDescription: clean(p.Location),
        acresBurned: p.AcresBurned ?? null,
        percentContained: p.PercentContained ?? null,
        startedAt: isoOrNull(p.Started),
        updatedAt: isoOrNull(p.Updated),
        url: incidentUrl(p.Url),
      })),
  };
}
