import { z } from "zod";
import {
  ObservationAggregateSchema, ObservationHazardKindSchema, type AggregateCell, type ObservationAggregate,
} from "./observation-aggregate";

/**
 * Public map drawing contract for moderated, unverified crowdsourced report activity.
 *
 * It accepts only the public half of `ObservationAggregate`. It never accepts raw reports,
 * pending submissions, private marks, report ids, exact reporter points, route inputs, or
 * official notices. The output is pure data props; it is not connected to production UI until
 * the report API, owner moderation, and rights review are ready.
 */

export const CROWD_REPORT_ACTIVITY_LEGEND =
  "Crowdsourced reports · unverified, not a fire perimeter or evacuation order" as const;

export const CROWD_REPORT_ACTIVITY_STYLE = {
  badgeSizePx: 28,
  strokeColor: "#facc15",
  fillColor: "transparent",
  strokeWidthPx: 3,
  opacity: 0.95,
} as const;

export type CrowdsourcedReportActivityEmptyReason = "absent" | "withheld" | "malformed" | "stale" | "no-visible-cells";

export type CrowdsourcedReportActivityBadge = {
  kind: "crowdsourced-report-activity-badge";
  /** Coarse-cell centre derived from `cellBounds`. Not a reporter point, fire origin, radius, perimeter, or zone. */
  center: { lng: number; lat: number };
  cellId: string;
  hazardKind: AggregateCell["hazardKind"];
  timeBinStart: string;
  timeBinEnd: string;
  /** Capped published report count. This is not a count of unique people. */
  reportCount: number;
  countSaturated: boolean;
  verification: "unverified";
  label: string;
  detail: string;
  style: typeof CROWD_REPORT_ACTIVITY_STYLE;
};

export type CrowdsourcedReportActivityLayer = {
  kind: "crowdsourced-report-activity-layer";
  legend: typeof CROWD_REPORT_ACTIVITY_LEGEND;
  drawing: "fixed-size-yellow-hollow-circle-badges";
  routeCoupling: false;
  officialAuthority: false;
  boundaryOrRadius: false;
  source: {
    label: "moderated crowdsourced aggregate";
    generatedAt: string;
    configVersion: string;
    moderationPolicyVersion: string;
  };
  badges: CrowdsourcedReportActivityBadge[];
  mapbox: {
    source: {
      type: "geojson";
      data: PointFeatureCollection;
    };
    layers: readonly [CircleLayerSpec];
  };
};

export type CrowdsourcedReportActivityResult =
  | { state: "ready"; layer: CrowdsourcedReportActivityLayer }
  | { state: "empty"; reason: CrowdsourcedReportActivityEmptyReason; layer: null };

export type CrowdsourcedReportActivityOptions = {
  /** Caller clock. Required so stale data fails closed and tests stay deterministic. */
  now: string;
  /** Max age for the aggregate generation time. Stale means no public badges. */
  maxAgeSeconds: number;
};

const Instant = z.iso.datetime({ offset: true });
const Longitude = z.number().finite().min(-180).max(180);
const Latitude = z.number().finite().min(-90).max(90);
const BoundsSchema = z.tuple([z.tuple([Longitude, Latitude]), z.tuple([Longitude, Latitude])]);

export const UnreviewedReportActivityCellSchema = z.object({
  cellId: z.string().min(1).max(128),
  /** Whole coarse-cell bounds only. No raw report point or private mark coordinate belongs here. */
  cellBounds: BoundsSchema,
  hazardKind: ObservationHazardKindSchema,
  timeBinStart: Instant,
  timeBinEnd: Instant,
  /** Server-produced count in this coarse cell/time bin. Capped and never unique people. */
  reportCount: z.number().int().min(3),
  countSaturated: z.boolean(),
  verification: z.literal("unreviewed"),
}).strict().superRefine((cell, ctx) => {
  const [[west, south], [east, north]] = cell.cellBounds;
  if (west >= east || south >= north) {
    ctx.addIssue({ code: "custom", path: ["cellBounds"], message: "bounds must be [[west, south], [east, north]]" });
  }
  if (Date.parse(cell.timeBinEnd) <= Date.parse(cell.timeBinStart)) {
    ctx.addIssue({ code: "custom", path: ["timeBinEnd"], message: "time bin must end after it starts" });
  }
});
export type UnreviewedReportActivityCell = z.infer<typeof UnreviewedReportActivityCellSchema>;

export const UnreviewedReportActivityInputSchema = z.object({
  version: z.literal(1),
  kind: z.literal("unreviewed-report-activity"),
  generatedAt: Instant,
  allClear: z.literal(false),
  verification: z.literal("unreviewed"),
  /** Required because 3 reports may be repeats from one actor; future anti-gaming may change a new version. */
  uniqueReporterDedupe: z.literal("not-possible"),
  producer: z.object({
    system: z.string().min(1).max(128),
    configVersion: z.string().min(1).max(64),
    retentionPolicyVersion: z.string().min(1).max(64),
    consentPolicyVersion: z.string().min(1).max(64),
  }).strict(),
  usage: z.object({
    routingHazardInput: z.literal(false),
    officialAuthority: z.literal(false),
    boundaryOrModelEstimate: z.literal(false),
  }).strict(),
  cells: z.array(UnreviewedReportActivityCellSchema).min(1).max(1000),
}).strict();
export type UnreviewedReportActivityInput = z.infer<typeof UnreviewedReportActivityInputSchema>;

export type UnreviewedReportActivityBadge = Omit<CrowdsourcedReportActivityBadge, "verification" | "label" | "detail"> & {
  verification: "unreviewed";
  label: "3+ unreviewed reports";
  detail: "3+ unreviewed reports — may be repeats, not a confirmed hazard";
};

export type UnreviewedReportActivityLayer = Omit<CrowdsourcedReportActivityLayer, "source" | "badges"> & {
  source: {
    label: "server-produced unreviewed report activity";
    generatedAt: string;
    configVersion: string;
    uniqueReporterDedupe: "not-possible";
  };
  badges: UnreviewedReportActivityBadge[];
};

export type UnreviewedReportActivityResult =
  | { state: "ready"; layer: UnreviewedReportActivityLayer }
  | { state: "empty"; reason: CrowdsourcedReportActivityEmptyReason; layer: null };

type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    kind: "crowdsourced-report-activity-badge";
    cellId: string;
    hazardKind: AggregateCell["hazardKind"];
    timeBinStart: string;
    timeBinEnd: string;
    reportCount: number;
    countSaturated: boolean;
    verification: "unverified" | "unreviewed";
    label: string;
    detail: string;
  };
};

type PointFeatureCollection = { type: "FeatureCollection"; features: PointFeature[] };

type CircleLayerSpec = {
  id: "crowdsourced-report-activity-badges";
  type: "circle";
  source: "crowdsourced-report-activity";
  paint: {
    "circle-radius": number;
    "circle-color": string;
    "circle-opacity": number;
    "circle-stroke-color": string;
    "circle-stroke-width": number;
    "circle-stroke-opacity": number;
  };
};

function isStale(aggregate: ObservationAggregate, options: CrowdsourcedReportActivityOptions): boolean {
  if (!Number.isFinite(options.maxAgeSeconds) || options.maxAgeSeconds <= 0) return true;
  const nowMs = Date.parse(options.now);
  const generatedMs = Date.parse(aggregate.generatedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(generatedMs)) return true;
  return generatedMs > nowMs || nowMs - generatedMs > options.maxAgeSeconds * 1000;
}

function cellCenter(cell: { cellBounds: [[number, number], [number, number]] }): { lng: number; lat: number } | null {
  const [[west, south], [east, north]] = cell.cellBounds;
  if (west >= east || south >= north) return null;
  return { lng: round((west + east) / 2), lat: round((south + north) / 2) };
}

const round = (value: number) => Number(value.toFixed(6));

function displayHazard(kind: AggregateCell["hazardKind"]): string {
  return kind.replaceAll("-", " ");
}

function badgeForCell(cell: AggregateCell): CrowdsourcedReportActivityBadge | null {
  if (cell.reportCount < 3 || cell.verification !== "unverified") return null;
  const center = cellCenter(cell);
  if (!center) return null;
  const count = cell.countSaturated ? `${cell.reportCount}+ capped reports` : `${cell.reportCount} reports`;
  const topic = displayHazard(cell.hazardKind);
  return {
    kind: "crowdsourced-report-activity-badge",
    center,
    cellId: cell.cellId,
    hazardKind: cell.hazardKind,
    timeBinStart: cell.timeBinStart,
    timeBinEnd: cell.timeBinEnd,
    reportCount: cell.reportCount,
    countSaturated: cell.countSaturated,
    verification: "unverified",
    label: `Crowdsourced ${topic} reports`,
    detail: `${count} in this coarse cell and time bin; unverified, not unique people, not a fire perimeter or evacuation order.`,
    style: CROWD_REPORT_ACTIVITY_STYLE,
  };
}

function featureForBadge(badge: CrowdsourcedReportActivityBadge | UnreviewedReportActivityBadge): PointFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [badge.center.lng, badge.center.lat] },
    properties: {
      kind: badge.kind,
      cellId: badge.cellId,
      hazardKind: badge.hazardKind,
      timeBinStart: badge.timeBinStart,
      timeBinEnd: badge.timeBinEnd,
      reportCount: badge.reportCount,
      countSaturated: badge.countSaturated,
      verification: badge.verification,
      label: badge.label,
      detail: badge.detail,
    },
  };
}

function unreviewedBadgeForCell(cell: UnreviewedReportActivityCell): UnreviewedReportActivityBadge | null {
  const center = cellCenter(cell);
  if (!center) return null;
  return {
    kind: "crowdsourced-report-activity-badge",
    center,
    cellId: cell.cellId,
    hazardKind: cell.hazardKind,
    timeBinStart: cell.timeBinStart,
    timeBinEnd: cell.timeBinEnd,
    reportCount: cell.reportCount,
    countSaturated: cell.countSaturated,
    verification: "unreviewed",
    label: "3+ unreviewed reports",
    detail: "3+ unreviewed reports — may be repeats, not a confirmed hazard",
    style: CROWD_REPORT_ACTIVITY_STYLE,
  };
}

function isUnreviewedStale(input: UnreviewedReportActivityInput, options: CrowdsourcedReportActivityOptions): boolean {
  if (!Number.isFinite(options.maxAgeSeconds) || options.maxAgeSeconds <= 0) return true;
  const nowMs = Date.parse(options.now);
  const generatedMs = Date.parse(input.generatedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(generatedMs)) return true;
  return generatedMs > nowMs || nowMs - generatedMs > options.maxAgeSeconds * 1000;
}

/**
 * Convert a server-produced unreviewed coarse-cell count feed into yellow badges.
 * This is deliberately separate from moderated `ObservationAggregate`: it does not relabel
 * moderated data as unreviewed, and it still refuses raw reports, private marks and ids.
 */
export function unreviewedReportActivityLayer(
  rawInput: unknown,
  options: CrowdsourcedReportActivityOptions,
): UnreviewedReportActivityResult {
  if (rawInput == null) return { state: "empty", reason: "absent", layer: null };
  const parsed = UnreviewedReportActivityInputSchema.safeParse(rawInput);
  if (!parsed.success) return { state: "empty", reason: "malformed", layer: null };
  const input = parsed.data;
  if (isUnreviewedStale(input, options)) return { state: "empty", reason: "stale", layer: null };
  const badges = input.cells.map(unreviewedBadgeForCell).filter((badge): badge is UnreviewedReportActivityBadge => badge !== null);
  if (badges.length === 0) return { state: "empty", reason: "no-visible-cells", layer: null };
  return {
    state: "ready",
    layer: {
      kind: "crowdsourced-report-activity-layer",
      legend: CROWD_REPORT_ACTIVITY_LEGEND,
      drawing: "fixed-size-yellow-hollow-circle-badges",
      routeCoupling: false,
      officialAuthority: false,
      boundaryOrRadius: false,
      source: {
        label: "server-produced unreviewed report activity",
        generatedAt: input.generatedAt,
        configVersion: input.producer.configVersion,
        uniqueReporterDedupe: "not-possible",
      },
      badges,
      mapbox: {
        source: { type: "geojson", data: { type: "FeatureCollection", features: badges.map(featureForBadge) } },
        layers: [{
          id: "crowdsourced-report-activity-badges",
          type: "circle",
          source: "crowdsourced-report-activity",
          paint: {
            "circle-radius": CROWD_REPORT_ACTIVITY_STYLE.badgeSizePx / 2,
            "circle-color": CROWD_REPORT_ACTIVITY_STYLE.fillColor,
            "circle-opacity": 0,
            "circle-stroke-color": CROWD_REPORT_ACTIVITY_STYLE.strokeColor,
            "circle-stroke-width": CROWD_REPORT_ACTIVITY_STYLE.strokeWidthPx,
            "circle-stroke-opacity": CROWD_REPORT_ACTIVITY_STYLE.opacity,
          },
        }],
      },
    },
  };
}

/**
 * Convert a public aggregate into fixed-size yellow activity badges.
 * Returns `empty` for absent, withheld, malformed, stale, or non-visible data.
 */
export function crowdReportActivityLayer(
  rawAggregate: unknown,
  options: CrowdsourcedReportActivityOptions,
): CrowdsourcedReportActivityResult {
  if (rawAggregate == null) return { state: "empty", reason: "absent", layer: null };
  const parsed = ObservationAggregateSchema.safeParse(rawAggregate);
  if (!parsed.success) return { state: "empty", reason: "malformed", layer: null };
  const aggregate = parsed.data;
  if (isStale(aggregate, options)) return { state: "empty", reason: "stale", layer: null };
  if (aggregate.state !== "published") return { state: "empty", reason: "withheld", layer: null };
  if (aggregate.provenance.moderation.status !== "attested" || !aggregate.provenance.rightsReviewed) {
    return { state: "empty", reason: "withheld", layer: null };
  }
  const badges = aggregate.cells.map(badgeForCell).filter((badge): badge is CrowdsourcedReportActivityBadge => badge !== null);
  if (badges.length === 0) return { state: "empty", reason: "no-visible-cells", layer: null };
  const data: PointFeatureCollection = { type: "FeatureCollection", features: badges.map(featureForBadge) };
  return {
    state: "ready",
    layer: {
      kind: "crowdsourced-report-activity-layer",
      legend: CROWD_REPORT_ACTIVITY_LEGEND,
      drawing: "fixed-size-yellow-hollow-circle-badges",
      routeCoupling: false,
      officialAuthority: false,
      boundaryOrRadius: false,
      source: {
        label: "moderated crowdsourced aggregate",
        generatedAt: aggregate.generatedAt,
        configVersion: aggregate.provenance.config.configVersion,
        moderationPolicyVersion: aggregate.provenance.moderation.policyVersion,
      },
      badges,
      mapbox: {
        source: { type: "geojson", data },
        layers: [{
          id: "crowdsourced-report-activity-badges",
          type: "circle",
          source: "crowdsourced-report-activity",
          paint: {
            "circle-radius": CROWD_REPORT_ACTIVITY_STYLE.badgeSizePx / 2,
            "circle-color": CROWD_REPORT_ACTIVITY_STYLE.fillColor,
            "circle-opacity": 0,
            "circle-stroke-color": CROWD_REPORT_ACTIVITY_STYLE.strokeColor,
            "circle-stroke-width": CROWD_REPORT_ACTIVITY_STYLE.strokeWidthPx,
            "circle-stroke-opacity": CROWD_REPORT_ACTIVITY_STYLE.opacity,
          },
        }],
      },
    },
  };
}
