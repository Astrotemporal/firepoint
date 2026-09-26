import { z } from "zod";
import { PublishedObservationSchema, WireVersion } from "./contracts";

/**
 * Pure aggregation contract for MODERATED community observations. No route, worker,
 * database, map layer, submission path or routing code imports this file.
 *
 * It answers one narrow question: "how many moderated, unverified observations of
 * hazard kind K were published for coarse cell C in time bin T?" It never answers
 * where a fire is, whether a road is blocked, how many people reported, or whether
 * any place is safe. Agency advisories/orders are a different lane (OfficialNotice)
 * and can never be produced from this input.
 */
const Instant = z.iso.datetime({ offset: true });
const Longitude = z.number().finite().min(-180).max(180);
const Latitude = z.number().finite().min(-90).max(90);

/** Hazard kinds a resident may describe. A kind is a claim topic, not a confirmed event type. */
export const ObservationHazardKindSchema = PublishedObservationSchema.shape.topic;
export type ObservationHazardKind = z.infer<typeof ObservationHazardKindSchema>;

/** Roughly one degree of latitude in metres; used only to compare declared precision with cell size. */
const METERS_PER_DEGREE = 111_000;

/**
 * Every aggregate must name its configuration and version so a reader can reproduce it.
 * Bounds keep cells coarse (>= ~1.1 km) and windows short enough that "recent" means recent.
 */
export const AggregationConfigSchema = z.object({
  configVersion: z.string().min(1).max(64),
  algorithm: z.literal("coarse-cell-count-bin"),
  /** Grid cell edge in degrees of longitude/latitude; 0.01 is roughly 1.1 km north-south. */
  cellSizeDegrees: z.number().finite().min(0.01).max(1),
  /** Time bin edge in seconds, 15 minutes to 24 hours, aligned to the Unix epoch. */
  timeBinSeconds: z.number().int().min(900).max(86_400),
  /** Observations older than this (relative to `now`) are excluded and listed as expired. */
  maxAgeSeconds: z.number().int().min(900).max(7 * 86_400),
  /**
   * Cells with fewer published observations are withheld, without saying where they are.
   * A threshold is a coarse suppression rule, not a privacy guarantee; each deployment needs its own review.
   */
  minReportsPerCell: z.number().int().min(2).max(50),
  /** Counts saturate here so that volume cannot visually escalate authority. */
  countCap: z.number().int().min(3).max(100),
  /** Named service coverage. Observations outside are excluded, never silently mapped elsewhere. */
  coverage: z.object({
    description: z.string().min(1),
    bounds: z.tuple([z.tuple([Longitude, Latitude]), z.tuple([Longitude, Latitude])]), // [[west, south], [east, north]]
  }),
}).strict().superRefine((config, ctx) => {
  const [[west, south], [east, north]] = config.coverage.bounds;
  if (west >= east || south >= north) {
    ctx.addIssue({ code: "custom", path: ["coverage", "bounds"], message: "bounds must be [[west, south], [east, north]]" });
  }
  if (config.minReportsPerCell > config.countCap) {
    ctx.addIssue({ code: "custom", path: ["minReportsPerCell"], message: "threshold cannot exceed the count cap" });
  }
});
export type AggregationConfig = z.infer<typeof AggregationConfigSchema>;

/**
 * Evidence that a named moderation owner reviewed the queue that produced the inputs.
 * `missing` is a first-class state: the aggregate is then withheld, never quietly published.
 */
export const ModerationAttestationSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("attested"),
    queueId: z.string().min(1).max(128),
    policyVersion: z.string().min(1).max(64),
    ownerRole: z.string().min(1).max(128),
    attestedAt: Instant,
  }).strict(),
  z.object({ status: z.literal("missing"), detail: z.string().min(1) }).strict(),
]);
export type ModerationAttestation = z.infer<typeof ModerationAttestationSchema>;

export const AggregationInputSchema = z.object({
  now: Instant,
  config: AggregationConfigSchema,
  moderation: ModerationAttestationSchema,
  /** Only moderated, published observations. Raw submissions and private marks do not parse. */
  observations: z.array(PublishedObservationSchema).max(10_000),
}).strict();
export type AggregationInput = z.infer<typeof AggregationInputSchema>;

export const ExclusionReasonSchema = z.enum([
  "no-public-point", "precision-coarser-than-cell", "outside-coverage", "expired",
  "future-dated", "published-after-attestation", "duplicate-id",
]);
export type ExclusionReason = z.infer<typeof ExclusionReasonSchema>;

const Id = z.string().min(1).max(256);
const CountBin = z.enum(["2-3", "4-9", "10+"]);

/** One coarse cell, one hazard kind, one time bin. No point, no polygon, no name of a person. */
export const AggregateCellSchema = z.object({
  cellId: z.string().regex(/^cell:[0-9.]+:-?\d+:-?\d+$/),
  /** [[west, south], [east, north]] of the whole grid cell; nothing finer than the cell is exported. */
  cellBounds: z.tuple([z.tuple([Longitude, Latitude]), z.tuple([Longitude, Latitude])]),
  hazardKind: ObservationHazardKindSchema,
  timeBinStart: Instant,
  timeBinEnd: Instant,
  /** Published observations counted, capped at `config.countCap`. Never unique people or confirmed events. */
  reportCount: z.number().int().min(2),
  countSaturated: z.boolean(),
  countBin: CountBin,
  oldestPublishedAt: Instant,
  newestPublishedAt: Instant,
  verification: z.literal("unverified"),
}).strict();
export type AggregateCell = z.infer<typeof AggregateCellSchema>;

/** Fixed wording that travels with every aggregate so a consumer cannot drop it. */
export const AGGREGATE_CAVEATS = {
  uncertainty: "Counts are moderated but unverified resident observations. They are not confirmed incidents, boundaries, forecasts, or road status.",
  abuse: "Nothing here proves how many different people reported. Repeated, coordinated, or mistaken reports raise counts; counts confer no official authority.",
  privacy: "Cells are coarse and small counts are withheld, which limits but does not eliminate re-identification risk. No exact reporter location, text, identity, report id, or submission time is included.",
  notAllClear: "An empty or withheld cell means no published reports met the threshold, never that the place is safe. Follow the issuing agency.",
} as const;
const CaveatsSchema = z.object({
  uncertainty: z.literal(AGGREGATE_CAVEATS.uncertainty),
  abuse: z.literal(AGGREGATE_CAVEATS.abuse),
  privacy: z.literal(AGGREGATE_CAVEATS.privacy),
  notAllClear: z.literal(AGGREGATE_CAVEATS.notAllClear),
}).strict();

/** Public provenance is coarse on purpose: counts by reason, never ids that could be joined to raw reports. */
const ProvenanceSchema = z.object({
  config: AggregationConfigSchema,
  moderation: ModerationAttestationSchema,
  offeredObservationCount: z.number().int().nonnegative(),
  countedObservationCount: z.number().int().nonnegative(),
  /** How many offered observations each rule excluded. Zero counts are listed so the reader sees the rule ran. */
  exclusionCounts: z.record(ExclusionReasonSchema, z.number().int().nonnegative()),
  /** Publisher/resident clocks of the counted inputs, never our generation time. */
  sourceTimes: z.object({
    earliestObservedAt: Instant.nullable(),
    latestObservedAt: Instant.nullable(),
    earliestPublishedAt: Instant.nullable(),
    latestPublishedAt: Instant.nullable(),
  }).strict(),
  /** No reporter identity exists at this layer, so repeat reports by one person cannot be collapsed. */
  uniqueReporterDedupe: z.literal("not-possible"),
}).strict();

const AggregateBaseSchema = z.object({
  version: WireVersion,
  kind: z.literal("community-observation-aggregate"),
  generatedAt: Instant,
  verification: z.literal("unverified"),
  allClear: z.literal(false),
  /** Machine-readable refusals; a consumer that wants these must build a different, reviewed system. */
  usage: z.object({
    routingHazardInput: z.literal(false),
    officialAuthority: z.literal(false),
    boundaryOrModelEstimate: z.literal(false),
  }).strict(),
  provenance: ProvenanceSchema,
  /** Cells below `minReportsPerCell`; only the number is public, never where they were. */
  withheldCellCount: z.number().int().nonnegative(),
  caveats: CaveatsSchema,
});

export const WithheldReasonSchema = z.enum(["missing-moderation", "no-eligible-observations", "all-cells-below-threshold"]);
export type WithheldReason = z.infer<typeof WithheldReasonSchema>;

export const ObservationAggregateSchema = z.discriminatedUnion("state", [
  AggregateBaseSchema.extend({ state: z.literal("published"), cells: z.array(AggregateCellSchema).min(1) }).strict(),
  AggregateBaseSchema.extend({ state: z.literal("withheld"), reason: WithheldReasonSchema, cells: z.array(AggregateCellSchema).length(0) }).strict(),
]);
export type ObservationAggregate = z.infer<typeof ObservationAggregateSchema>;

/**
 * Private audit sidecar. It names every offered id and why each was excluded, so it can be joined
 * back to raw reports; that is exactly why it must never be serialized to a UI, public route, log
 * line, or analytics event. A future publisher keeps it in access-controlled storage or drops it.
 */
export const AggregationAuditSchema = z.object({
  audience: z.literal("private-audit"),
  generatedAt: Instant,
  configVersion: z.string().min(1).max(64),
  /** Sorted ids of every observation offered, before any exclusion. */
  inputObservationIds: z.array(Id),
  excluded: z.array(z.object({ id: Id, reason: ExclusionReasonSchema }).strict()),
  /** Number of (cell, kind, bin) groups withheld for being under the threshold. Locations stay out. */
  withheldCellCount: z.number().int().nonnegative(),
}).strict();
export type AggregationAudit = z.infer<typeof AggregationAuditSchema>;

/** The two halves are separate objects so a caller cannot export one without choosing to. */
export type AggregationResult = { aggregate: ObservationAggregate; audit: AggregationAudit };

function cellIndex(config: AggregationConfig, point: readonly [number, number]) {
  const [longitude, latitude] = point;
  return { ix: Math.floor(longitude / config.cellSizeDegrees), iy: Math.floor(latitude / config.cellSizeDegrees) };
}

function insideBounds(config: AggregationConfig, point: readonly [number, number]): boolean {
  const [[west, south], [east, north]] = config.coverage.bounds;
  const [longitude, latitude] = point;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function countBin(count: number): z.infer<typeof CountBin> {
  return count >= 10 ? "10+" : count >= 4 ? "4-9" : "2-3";
}

const round = (value: number) => Number(value.toFixed(6));

/**
 * Aggregate moderated observations into coarse cells. Pure and deterministic for a given input.
 * Throws on malformed input; returns a `withheld` aggregate (never an empty "published" one)
 * when moderation is missing or nothing meets the threshold. `aggregate` is the only part that
 * may ever be published; `audit` carries ids and stays private.
 */
export function aggregateObservations(rawInput: unknown): AggregationResult {
  const input = AggregationInputSchema.parse(rawInput);
  const { config, moderation, now } = input;
  const nowMs = Date.parse(now);
  const inputObservationIds = input.observations.map((item) => item.id).sort();
  const seen = new Set<string>();
  const excluded: { id: string; reason: ExclusionReason }[] = [];
  const counted: typeof input.observations = [];
  const cellSizeMeters = config.cellSizeDegrees * METERS_PER_DEGREE;
  const attestedAtMs = moderation.status === "attested" ? Date.parse(moderation.attestedAt) : null;

  for (const item of input.observations) {
    const exclude = (reason: ExclusionReason) => excluded.push({ id: item.id, reason });
    if (seen.has(item.id)) { exclude("duplicate-id"); continue; }
    seen.add(item.id);
    const effectiveAt = Date.parse(item.observedAt ?? item.publishedAt);
    if (item.approximatePoint === null || item.precisionMeters === null) { exclude("no-public-point"); continue; }
    if (item.precisionMeters > cellSizeMeters) { exclude("precision-coarser-than-cell"); continue; }
    if (!insideBounds(config, item.approximatePoint)) { exclude("outside-coverage"); continue; }
    if (effectiveAt > nowMs || Date.parse(item.publishedAt) > nowMs) { exclude("future-dated"); continue; }
    if (nowMs - effectiveAt > config.maxAgeSeconds * 1000) { exclude("expired"); continue; }
    if (attestedAtMs !== null && Date.parse(item.publishedAt) > attestedAtMs) { exclude("published-after-attestation"); continue; }
    counted.push(item);
  }

  const publishedTimes = counted.map((item) => Date.parse(item.publishedAt));
  const observedTimes = counted.flatMap((item) => item.observedAt ? [Date.parse(item.observedAt)] : []);
  const iso = (values: number[], pick: (...v: number[]) => number) => values.length ? new Date(pick(...values)).toISOString() : null;
  const exclusionCounts = Object.fromEntries(ExclusionReasonSchema.options.map((reason) =>
    [reason, excluded.filter((item) => item.reason === reason).length])) as Record<ExclusionReason, number>;
  const provenance: z.infer<typeof ProvenanceSchema> = {
    config, moderation,
    offeredObservationCount: input.observations.length,
    countedObservationCount: counted.length,
    exclusionCounts,
    sourceTimes: {
      earliestObservedAt: iso(observedTimes, Math.min), latestObservedAt: iso(observedTimes, Math.max),
      earliestPublishedAt: iso(publishedTimes, Math.min), latestPublishedAt: iso(publishedTimes, Math.max),
    },
    uniqueReporterDedupe: "not-possible",
  };
  const base = {
    version: 1 as const, kind: "community-observation-aggregate" as const, generatedAt: now,
    verification: "unverified" as const, allClear: false as const,
    usage: { routingHazardInput: false as const, officialAuthority: false as const, boundaryOrModelEstimate: false as const },
    provenance, caveats: AGGREGATE_CAVEATS,
  };
  const finish = (aggregate: unknown, withheldCellCount: number): AggregationResult => ({
    aggregate: ObservationAggregateSchema.parse(aggregate),
    audit: AggregationAuditSchema.parse({ audience: "private-audit", generatedAt: now, configVersion: config.configVersion,
      inputObservationIds, excluded, withheldCellCount }),
  });
  const withheld = (reason: WithheldReason, withheldCellCount: number) =>
    finish({ ...base, state: "withheld", reason, withheldCellCount, cells: [] }, withheldCellCount);

  if (moderation.status !== "attested") return withheld("missing-moderation", 0);
  if (counted.length === 0) return withheld("no-eligible-observations", 0);

  const groups = new Map<string, typeof counted>();
  const binMs = config.timeBinSeconds * 1000;
  for (const item of counted) {
    const point = item.approximatePoint as [number, number];
    const { ix, iy } = cellIndex(config, point);
    const binStart = Math.floor(Date.parse(item.observedAt ?? item.publishedAt) / binMs) * binMs;
    const key = `${ix}|${iy}|${item.topic}|${binStart}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const cells: AggregateCell[] = [];
  let withheldCellCount = 0;
  for (const [key, members] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (members.length < config.minReportsPerCell) { withheldCellCount += 1; continue; }
    const [ix, iy, topic, binStart] = key.split("|") as [string, string, ObservationHazardKind, string];
    const west = Number(ix) * config.cellSizeDegrees;
    const south = Number(iy) * config.cellSizeDegrees;
    const published = members.map((item) => Date.parse(item.publishedAt));
    const count = Math.min(members.length, config.countCap);
    cells.push({
      cellId: `cell:${config.cellSizeDegrees}:${ix}:${iy}`,
      cellBounds: [[round(west), round(south)], [round(west + config.cellSizeDegrees), round(south + config.cellSizeDegrees)]],
      hazardKind: topic,
      timeBinStart: new Date(Number(binStart)).toISOString(),
      timeBinEnd: new Date(Number(binStart) + binMs).toISOString(),
      reportCount: count,
      countSaturated: members.length >= config.countCap,
      countBin: countBin(count),
      oldestPublishedAt: new Date(Math.min(...published)).toISOString(),
      newestPublishedAt: new Date(Math.max(...published)).toISOString(),
      verification: "unverified",
    });
  }
  if (cells.length === 0) return withheld("all-cells-below-threshold", withheldCellCount);
  return finish({ ...base, state: "published", withheldCellCount, cells }, withheldCellCount);
}
