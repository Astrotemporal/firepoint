import { z } from "zod";
import { PerimeterGeometrySchema, type FirePerimeter } from "@/domain/contracts";
import { fetchJson, type FetchFailure, type FetchJsonOptions } from "./fetch-json";

/** NIFC/WFIGS public current perimeters. Not spread forecasts or evacuation lines. */
export const NIFC_LAYER_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0";
const MAX_FEATURES = 100;

const epochMs = z.number().int().nullable().optional();
const perimeterSchema = z.object({
  type: z.literal("Feature"),
  geometry: PerimeterGeometrySchema,
  properties: z.object({
    OBJECTID: z.number().int(),
    poly_IncidentName: z.string().min(1),
    poly_GISAcres: z.number().nullable().optional(),
    poly_PolygonDateTime: epochMs,
    poly_DateCurrent: epochMs,
    attr_IncidentTypeCategory: z.string().nullable().optional(),
    attr_PercentContained: z.number().nullable().optional(),
  }),
});
const collectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  properties: z.object({ exceededTransferLimit: z.boolean().optional() }).optional(),
  features: z.array(perimeterSchema),
});

export type NifcPerimeter = {
  objectId: number;
  incidentName: string;
  incidentType: FirePerimeter["incidentType"];
  gisAcres: number | null;
  percentContained: number | null;
  polygonCapturedAt: string | null;
  updatedAt: string | null;
  recordUrl: string;
  geometry: FirePerimeter["geometry"];
};

export type NifcFailure = FetchFailure | "partial_response";
export type NifcResult =
  | { status: "ok"; sourceUrl: string; checkedAt: string; perimeters: NifcPerimeter[] }
  | { status: "unavailable"; sourceUrl: string; attemptedAt: string; reason: NifcFailure; httpStatus?: number };

const TYPES: Record<string, FirePerimeter["incidentType"]> = { WF: "wildfire", RX: "prescribed", CX: "complex" };

function isoFromEpoch(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

/**
 * Coarse search box around a point. The centre is snapped to a 0.1° grid so the
 * publisher only learns an approximate area, never the resident's exact point.
 */
export function searchEnvelope([longitude, latitude]: readonly [number, number], radiusKm: number) {
  const snap = (value: number) => Math.round(value * 10) / 10;
  const lat = snap(latitude);
  const lon = snap(longitude);
  const padLat = radiusKm / 111.32 + 0.1;
  const padLon = radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180))) + 0.1;
  const round = (value: number) => Number(value.toFixed(3));
  return {
    xmin: round(Math.max(-180, lon - padLon)), ymin: round(Math.max(-90, lat - padLat)),
    xmax: round(Math.min(180, lon + padLon)), ymax: round(Math.min(90, lat + padLat)),
  };
}

/** Fetch current perimeters intersecting a coarse box. Partial pages are errors, not results. */
export async function fetchNifcPerimeters({
  point, radiusKm, now = () => new Date(), ...options
}: FetchJsonOptions & { point: readonly [number, number]; radiusKm: number; now?: () => Date }): Promise<NifcResult> {
  const box = searchEnvelope(point, radiusKm);
  const url = new URL(`${NIFC_LAYER_URL}/query`);
  const params: Record<string, string> = {
    where: "1=1",
    geometry: `${box.xmin},${box.ymin},${box.xmax},${box.ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OBJECTID,poly_IncidentName,poly_GISAcres,poly_PolygonDateTime,poly_DateCurrent,attr_IncidentTypeCategory,attr_PercentContained",
    returnGeometry: "true",
    geometryPrecision: "5",
    maxAllowableOffset: "0.0005",
    resultRecordCount: String(MAX_FEATURES),
    f: "geojson",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const failed = (reason: NifcFailure, httpStatus?: number): NifcResult => ({
    status: "unavailable", sourceUrl: NIFC_LAYER_URL, attemptedAt: now().toISOString(), reason,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  });
  const result = await fetchJson(url.toString(), { ...options, headers: { Accept: "application/geo+json" } });
  if (!result.ok) return failed(result.reason, result.httpStatus);
  // ArcGIS reports some query errors as HTTP 200 with an `error` body.
  if (typeof result.data === "object" && result.data !== null && "error" in result.data) return failed("invalid_response");
  const parsed = collectionSchema.safeParse(result.data);
  if (!parsed.success) return failed("invalid_response");
  if (parsed.data.properties?.exceededTransferLimit) return failed("partial_response");
  return {
    status: "ok",
    sourceUrl: NIFC_LAYER_URL,
    checkedAt: now().toISOString(),
    perimeters: parsed.data.features.map(({ geometry, properties: p }) => ({
      objectId: p.OBJECTID,
      incidentName: p.poly_IncidentName.trim(),
      incidentType: TYPES[p.attr_IncidentTypeCategory ?? ""] ?? "unknown",
      gisAcres: p.poly_GISAcres ?? null,
      percentContained: p.attr_PercentContained ?? null,
      polygonCapturedAt: isoFromEpoch(p.poly_PolygonDateTime),
      updatedAt: isoFromEpoch(p.poly_DateCurrent),
      recordUrl: `${NIFC_LAYER_URL}/query?objectIds=${p.OBJECTID}&outFields=*&f=html`,
      geometry,
    })),
  };
}
