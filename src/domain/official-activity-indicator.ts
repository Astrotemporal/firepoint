import { z } from "zod";
import { PerimeterGeometrySchema, PointSchema } from "./contracts";

/**
 * Display policy for RED public map badges.
 *
 * Red is reserved for active official/agency-confirmed incident or evacuation records with
 * authority, source, clocks, and geometry. Crowdsourced aggregates can never select red.
 * This file defines a pure, unconnected contract only; it does not fetch or invent an agency feed.
 */

const Instant = z.iso.datetime({ offset: true });
const SourceUrl = z.url().refine((url) => new URL(url).protocol === "https:", "sourceUrl must use HTTPS");

export const OFFICIAL_ACTIVITY_INDICATOR_LEGEND =
  "Official active notice · follow issuing agency source" as const;

export const OFFICIAL_ACTIVITY_INDICATOR_STYLE = {
  badgeSizePx: 28,
  strokeColor: "#dc2626",
  fillColor: "transparent",
  strokeWidthPx: 3,
  opacity: 0.98,
} as const;

export const OfficialActivityIndicatorRecordSchema = z.object({
  kind: z.literal("official-activity-indicator-record"),
  status: z.literal("active"),
  activity: z.enum(["incident", "evacuation"]),
  issuer: z.string().min(1),
  sourceUrl: SourceUrl,
  recordId: z.string().min(1).max(256),
  issuedAt: Instant,
  updatedAt: Instant,
  retrievedAt: Instant,
  geometry: z.discriminatedUnion("type", [
    z.object({ type: z.literal("Point"), coordinates: PointSchema }).strict(),
    PerimeterGeometrySchema.options[0],
    PerimeterGeometrySchema.options[1],
  ]),
  caveat: z.string().min(1),
}).strict().superRefine((record, ctx) => {
  if (Date.parse(record.updatedAt) < Date.parse(record.issuedAt)) {
    ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt cannot be before issuedAt" });
  }
});
export type OfficialActivityIndicatorRecord = z.infer<typeof OfficialActivityIndicatorRecordSchema>;

export type OfficialActivityIndicatorEmptyReason = "absent" | "malformed" | "stale" | "no-active-official-records";

export type OfficialActivityBadge = {
  kind: "official-activity-badge";
  center: { lng: number; lat: number };
  activity: "incident" | "evacuation";
  issuer: string;
  sourceUrl: string;
  issuedAt: string;
  updatedAt: string;
  retrievedAt: string;
  label: string;
  detail: string;
  style: typeof OFFICIAL_ACTIVITY_INDICATOR_STYLE;
};

export type OfficialActivityIndicatorLayer = {
  kind: "official-activity-indicator-layer";
  legend: typeof OFFICIAL_ACTIVITY_INDICATOR_LEGEND;
  drawing: "fixed-size-red-hollow-circle-badges";
  routeCoupling: false;
  officialAuthority: true;
  boundaryOrRadius: false;
  badges: OfficialActivityBadge[];
};

export type OfficialActivityIndicatorResult =
  | { state: "ready"; layer: OfficialActivityIndicatorLayer }
  | { state: "empty"; reason: OfficialActivityIndicatorEmptyReason; layer: null };

export type OfficialActivityIndicatorOptions = { now: string; maxAgeSeconds: number };

const round = (value: number) => Number(value.toFixed(6));

function stale(record: OfficialActivityIndicatorRecord, options: OfficialActivityIndicatorOptions): boolean {
  if (!Number.isFinite(options.maxAgeSeconds) || options.maxAgeSeconds <= 0) return true;
  const nowMs = Date.parse(options.now);
  const updatedMs = Date.parse(record.updatedAt);
  const retrievedMs = Date.parse(record.retrievedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(updatedMs) || !Number.isFinite(retrievedMs)) return true;
  return updatedMs > nowMs || retrievedMs > nowMs || nowMs - updatedMs > options.maxAgeSeconds * 1000;
}

function positions(geometry: OfficialActivityIndicatorRecord["geometry"]): [number, number][] {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  return geometry.coordinates.flat(2);
}

function centerOfGeometry(geometry: OfficialActivityIndicatorRecord["geometry"]): { lng: number; lat: number } | null {
  const coords = positions(geometry);
  if (coords.length === 0) return null;
  const sums = coords.reduce((acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }), { lng: 0, lat: 0 });
  return { lng: round(sums.lng / coords.length), lat: round(sums.lat / coords.length) };
}

function badge(record: OfficialActivityIndicatorRecord): OfficialActivityBadge | null {
  const center = centerOfGeometry(record.geometry);
  if (!center) return null;
  return {
    kind: "official-activity-badge",
    center,
    activity: record.activity,
    issuer: record.issuer,
    sourceUrl: record.sourceUrl,
    issuedAt: record.issuedAt,
    updatedAt: record.updatedAt,
    retrievedAt: record.retrievedAt,
    label: `Official active ${record.activity}`,
    detail: `${record.issuer}; issued ${record.issuedAt}; updated ${record.updatedAt}. Follow the source.`,
    style: OFFICIAL_ACTIVITY_INDICATOR_STYLE,
  };
}

/**
 * Build red badges only from explicit official active records. Anything else fails closed.
 */
export function officialActivityIndicatorLayer(
  rawRecords: unknown,
  options: OfficialActivityIndicatorOptions,
): OfficialActivityIndicatorResult {
  if (rawRecords == null) return { state: "empty", reason: "absent", layer: null };
  const parsed = z.array(OfficialActivityIndicatorRecordSchema).safeParse(rawRecords);
  if (!parsed.success) return { state: "empty", reason: "malformed", layer: null };
  const badges = parsed.data.filter((record) => !stale(record, options)).map(badge)
    .filter((item): item is OfficialActivityBadge => item !== null);
  if (badges.length === 0) return { state: "empty", reason: "no-active-official-records", layer: null };
  return {
    state: "ready",
    layer: {
      kind: "official-activity-indicator-layer",
      legend: OFFICIAL_ACTIVITY_INDICATOR_LEGEND,
      drawing: "fixed-size-red-hollow-circle-badges",
      routeCoupling: false,
      officialAuthority: true,
      boundaryOrRadius: false,
      badges,
    },
  };
}
