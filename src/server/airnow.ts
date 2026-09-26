import { z } from "zod";
import { fetchJson, type FetchFailure, type FetchJsonOptions } from "./fetch-json";

/** AirNow current observations by reporting area. Preliminary data, not address-level exposure. */
export const AIRNOW_ENDPOINT = "https://www.airnowapi.org/aq/observation/latLong/current/";
const SEARCH_MILES = 25;

const observationSchema = z.object({
  DateObserved: z.string(),
  HourObserved: z.number().int().min(0).max(23),
  LocalTimeZone: z.string(),
  ReportingArea: z.string().min(1),
  StateCode: z.string().nullable().optional(),
  ParameterName: z.string().min(1),
  AQI: z.number().int(),
  Category: z.object({ Number: z.number().int().nullable().optional(), Name: z.string().nullable().optional() }).nullable().optional(),
});

export type AirNowObservation = {
  reportingArea: string;
  stateCode: string | null;
  pollutant: string;
  aqi: number;
  category: string | null;
  observedAt: string | null;
};

export type AirNowResult =
  | { status: "ok"; sourceUrl: string; checkedAt: string; observations: AirNowObservation[] }
  | { status: "unavailable"; sourceUrl: string; attemptedAt: string; reason: FetchFailure; httpStatus?: number };

/** Offsets for the zone labels AirNow publishes. Unknown labels leave the time unknown. */
const ZONE_OFFSETS: Record<string, string> = {
  HST: "-10:00", AKST: "-09:00", AKDT: "-08:00", PST: "-08:00", PDT: "-07:00",
  MST: "-07:00", MDT: "-06:00", CST: "-06:00", CDT: "-05:00", EST: "-05:00", EDT: "-04:00",
};

/** Build an ISO instant from AirNow's local date, hour and the zone label it states. */
export function airNowObservedAt(date: string, hour: number, zone: string): string | null {
  const day = date.trim();
  const offset = ZONE_OFFSETS[zone.trim().toUpperCase()];
  if (!offset || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00${offset}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Fetch current AirNow observations near a point. The point is snapped to a 0.1°
 * grid before leaving our server; the key never appears in any returned URL.
 */
export async function fetchAirNowObservations({
  point, apiKey, now = () => new Date(), ...options
}: FetchJsonOptions & { point: readonly [number, number]; apiKey: string; now?: () => Date }): Promise<AirNowResult> {
  if (!apiKey.trim() || /[\s&?#]/.test(apiKey.trim())) throw new TypeError("AIRNOW_API_KEY is not a usable key");
  const snap = (value: number) => (Math.round(value * 10) / 10).toFixed(1);
  const url = new URL(AIRNOW_ENDPOINT);
  url.searchParams.set("format", "application/json");
  url.searchParams.set("latitude", snap(point[1]));
  url.searchParams.set("longitude", snap(point[0]));
  url.searchParams.set("distance", String(SEARCH_MILES));
  url.searchParams.set("API_KEY", apiKey.trim());

  const failed = (reason: FetchFailure, httpStatus?: number): AirNowResult => ({
    status: "unavailable", sourceUrl: AIRNOW_ENDPOINT, attemptedAt: now().toISOString(), reason,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  });
  const result = await fetchJson(url.toString(), { ...options, headers: { Accept: "application/json" } });
  if (!result.ok) return failed(result.reason, result.httpStatus);
  const parsed = z.array(observationSchema).safeParse(result.data);
  if (!parsed.success) return failed("invalid_response");
  return {
    status: "ok",
    sourceUrl: AIRNOW_ENDPOINT,
    checkedAt: now().toISOString(),
    // AirNow uses negative AQI values for "no data"; they are omitted, not shown as zero.
    observations: parsed.data.filter((row) => row.AQI >= 0).map((row) => ({
      reportingArea: row.ReportingArea.trim(),
      stateCode: row.StateCode?.trim() || null,
      pollutant: row.ParameterName.trim(),
      aqi: row.AQI,
      category: row.Category?.Name?.trim() || null,
      observedAt: airNowObservedAt(row.DateObserved, row.HourObserved, row.LocalTimeZone),
    })),
  };
}
