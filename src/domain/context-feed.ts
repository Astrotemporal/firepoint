import {
  ContextFeedSchema,
  type AirQualityReading,
  type ContextFeed,
  type FirePerimeter,
  type SourceCheck,
  type WildfireIncident,
} from "./contracts";
import { CALFIRE_INCIDENTS_URL, type CalFireResult } from "@/server/calfire";
import { NIFC_LAYER_URL, type NifcResult } from "@/server/nifc";
import { AIRNOW_ENDPOINT, type AirNowResult } from "@/server/airnow";
import { distanceKm } from "@/server/fetch-json";

/** Firepoint freshness policy per source, not a statement about publication frequency. */
const STALE_AFTER = { calfire: 900, nifc: 900, airnow: 3600 } as const;

const INCIDENT_CAVEAT =
  "CAL FIRE incident listing. Location, size and containment are publisher estimates that can lag. Not an evacuation order and not a statement that any place is safe.";
const PERIMETER_CAVEAT =
  "NIFC/WFIGS mapped perimeter as of the capture time shown. It can lag the fire, omit areas, or describe a prescribed burn. Not a spread forecast or evacuation boundary.";
const AIR_CAVEAT =
  "Preliminary AirNow observation for a reporting area, not your exact location. Real-time data is unvalidated and may change.";

type SourceResult = { status: "ok"; checkedAt: string } | { status: "unavailable"; attemptedAt: string; reason: string; httpStatus?: number };

function check(
  sourceKey: string, operator: string, endpoint: string, staleAfterSeconds: number,
  result: SourceResult | "not-configured", notConfiguredDetail = "",
): SourceCheck {
  if (result === "not-configured") {
    return {
      sourceKey, operator, endpoint, applicable: true, status: "not-configured",
      lastAttemptAt: null, lastSuccessAt: null, sourceAsOf: null, staleAfterSeconds, detail: notConfiguredDetail,
    };
  }
  const ok = result.status === "ok";
  return {
    sourceKey, operator, endpoint, applicable: true, status: ok ? "ok" : "down",
    lastAttemptAt: ok ? result.checkedAt : result.attemptedAt,
    lastSuccessAt: ok ? result.checkedAt : null,
    sourceAsOf: null,
    staleAfterSeconds,
    detail: ok ? null : `${operator} request unavailable (${result.reason}${result.httpStatus ? ` ${result.httpStatus}` : ""})`,
  };
}

export type ContextInputs = {
  point: readonly [number, number];
  radiusKm: number;
  generatedAt: string;
  calfire: CalFireResult;
  nifc: NifcResult;
  airnow: AirNowResult | "not-configured";
};

/** Combine per-source results. A failed source yields a `down` check, never an empty list claim. */
export function buildContextFeed({ point, radiusKm, generatedAt, calfire, nifc, airnow }: ContextInputs): ContextFeed {
  const sourceChecks = [
    check("calfire-incidents", "CAL FIRE", CALFIRE_INCIDENTS_URL, STALE_AFTER.calfire, calfire),
    check("nifc-current-perimeters", "NIFC / WFIGS", NIFC_LAYER_URL, STALE_AFTER.nifc, nifc),
    check("airnow-current-observations", "AirNow (U.S. EPA)", AIRNOW_ENDPOINT, STALE_AFTER.airnow, airnow,
      "Server has no AIRNOW_API_KEY; air quality was not checked."),
  ];

  const incidents: WildfireIncident[] = calfire.status !== "ok" ? [] : calfire.incidents
    .map((incident) => ({ incident, km: distanceKm(point, incident.point) }))
    .filter(({ km }) => km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .map(({ incident, km }) => ({
      kind: "wildfire-incident",
      name: incident.name,
      incidentType: incident.incidentType,
      county: incident.county,
      locationDescription: incident.locationDescription,
      point: incident.point,
      distanceKm: Math.round(km * 10) / 10,
      acresBurned: incident.acresBurned,
      percentContained: incident.percentContained,
      startedAt: incident.startedAt,
      caveat: INCIDENT_CAVEAT,
      origin: {
        operator: "CAL FIRE", issuer: null, recordId: incident.id, recordUrl: incident.url,
        retrievedAt: calfire.checkedAt, issuedAt: null, updatedAt: incident.updatedAt,
      },
    }));

  const perimeters: FirePerimeter[] = nifc.status !== "ok" ? [] : nifc.perimeters
    .map((perimeter) => ({
      kind: "fire-perimeter" as const,
      incidentName: perimeter.incidentName,
      incidentType: perimeter.incidentType,
      gisAcres: perimeter.gisAcres === null ? null : Math.round(perimeter.gisAcres),
      percentContained: perimeter.percentContained,
      polygonCapturedAt: perimeter.polygonCapturedAt,
      geometry: perimeter.geometry,
      caveat: PERIMETER_CAVEAT,
      origin: {
        operator: "NIFC / WFIGS", issuer: null, recordId: String(perimeter.objectId), recordUrl: perimeter.recordUrl,
        retrievedAt: nifc.checkedAt, issuedAt: null, updatedAt: perimeter.updatedAt,
      },
    }))
    .sort((a, b) => (b.polygonCapturedAt ?? "").localeCompare(a.polygonCapturedAt ?? ""));

  const airQuality: AirQualityReading[] = airnow === "not-configured" || airnow.status !== "ok" ? [] : airnow.observations
    .map((row) => ({
      kind: "air-quality-observation" as const,
      reportingArea: row.stateCode ? `${row.reportingArea}, ${row.stateCode}` : row.reportingArea,
      pollutant: row.pollutant,
      aqi: row.aqi,
      category: row.category,
      observedAt: row.observedAt,
      preliminary: true as const,
      caveat: AIR_CAVEAT,
      origin: {
        operator: "AirNow (U.S. EPA)", issuer: null,
        recordId: `${row.reportingArea}|${row.pollutant}|${row.observedAt ?? "unknown"}`,
        recordUrl: "https://www.airnow.gov/", retrievedAt: airnow.checkedAt, issuedAt: null, updatedAt: row.observedAt,
      },
    }))
    .sort((a, b) => b.aqi - a.aqi);

  return ContextFeedSchema.parse({
    version: 1, generatedAt, radiusKm, sourceChecks, incidents, perimeters, airQuality, allClear: false,
  });
}
