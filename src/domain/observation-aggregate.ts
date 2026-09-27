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
  minReportsPerCell: z.number().int().min(3).max(50),
  /** Counts saturate here so that volume cannot visually escalate authority. Must be >= minReportsPerCell. */
  countCap: z.number().int().min(3).max(100),
  /**
   * Named service coverage, half-open on the east/north edge. Every bound must sit on the cell
   * grid so no published cell can extend beyond coverage. Observations outside are excluded.
   */
  coverage: z.object({
    description: z.string().min(1),
    bounds: z.tuple([z.tuple([Longitude, Latitude]), z.tuple([Longitude, Latitude])]), // [[west, south], [east, north]]
  }),
}).strict().superRefine((config, ctx) => {
  const [[west, south], [east, north]] = config.coverage.bounds;
  if (west >= east || south >= north) {
    ctx.addIssue({ code: "custom", path: ["coverage", "bounds"], message: "bounds must be [[west, south], [east, north]]" });
  }
  for (const [index, value] of [west, south, east, north].entries()) {
    const ratio = value / config.cellSizeDegrees;
    if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
      ctx.addIssue({ code: "custom", path: ["coverage", "bounds", Math.floor(index / 2), index % 2],
        message: "coverage bounds must be multiples of cellSizeDegrees" });
    }
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
  /** Publication terms (consent, retention, takedown, reuse) reviewed for this config version. False withholds. */
  rightsReviewed: z.boolean(),
  /** Only moderated, published observations. Raw submissions and private marks do not parse. */
  observations: z.array(PublishedObservationSchema).max(10_000),
}).strict().superRefine((input, ctx) => {
  // A repeated id is a caller bug (or a replay), not a record to pick from. Reject the whole input.
  const ids = new Set<string>();
  for (const [index, item] of input.observations.entries()) {
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: ["observations", index, "id"], message: `duplicate observation id ${item.id}` });
    ids.add(item.id);
  }
});
export type AggregationInput = z.infer<typeof AggregationInputSchema>;

export const ExclusionReasonSchema = z.enum([
  "no-public-point", "precision-coarser-than-cell", "outside-coverage", "expired",
  "future-dated", "published-after-attestation",
]);
export type ExclusionReason = z.infer<typeof ExclusionReasonSchema>;

const Id = z.string().min(1).max(256);
const CountBin = z.enum(["3-5", "6-9", "10+"]);

/** One coarse cell, one hazard kind, one time bin. No point, no polygon, no name of a person. */
export const AggregateCellSchema = z.object({
  cellId: z.string().regex(/^cell:[0-9.]+:-?\d+:-?\d+$/),
  /** [[west, south], [east, north]] of the whole grid cell; nothing finer than the cell is exported. */
  cellBounds: z.tuple([z.tuple([Longitude, Latitude]), z.tuple([Longitude, Latitude])]),
  hazardKind: ObservationHazardKindSchema,
  timeBinStart: Instant,
  timeBinEnd: Instant,
  /** Published observations counted, capped at `config.countCap`. Never unique people or confirmed events. */
  reportCount: z.number().int().min(3),
  countSaturated: z.boolean(),
  countBin: CountBin,
  verification: z.literal("unverified"),
}).strict();
export type AggregateCell = z.infer<typeof AggregateCellSchema>;

/** Fixed wording that travels with every aggregate so a consumer cannot drop it. */
export const AGGREGATE_CAVEATS = {
  uncertainty: "Counts are moderated but unverified resident observations. They are not confirmed incidents, boundaries, forecasts, or road status.",
  abuse: "Nothing here proves how many different people reported. Repeated, coordinated, or mistaken reports raise counts; counts confer no official authority.",
  privacy: "Cells are coarse and small counts are withheld, which limits but does not eliminate re-identification risk. No exact reporter location, text, identity, report id, or per-report time is included; times are bin-aligned.",
  notAllClear: "An empty or withheld cell means no published reports met the threshold, never that the place is safe. Follow the issuing agency.",
} as const;
const CaveatsSchema = z.object({
  uncertainty: z.literal(AGGREGATE_CAVEATS.uncertainty),
  abuse: z.literal(AGGREGATE_CAVEATS.abuse),
  privacy: z.literal(AGGREGATE_CAVEATS.privacy),
  notAllClear: z.literal(AGGREGATE_CAVEATS.notAllClear),
}).strict();

/**
 * Public provenance is coarse on purpose: counts by reason and bin-aligned watermarks, never ids
 * or per-report clocks that could be joined to raw reports. Withheld outputs carry less still.
 */
const WithheldProvenanceSchema = z.object({
  config: AggregationConfigSchema,
  moderation: ModerationAttestationSchema,
  rightsReviewed: z.boolean(),
}).strict();
const PublishedProvenanceSchema = WithheldProvenanceSchema.extend({
  offeredObservationCount: z.number().int().positive(),
  countedObservationCount: z.number().int().positive(),
  /** How many offered observations each rule excluded. Zero counts are listed so the reader sees the rule ran. */
  exclusionCounts: z.record(ExclusionReasonSchema, z.number().int().nonnegative()),
  /** Earliest bin start and latest bin end that contain a counted observation; aligned to `timeBinSeconds`, never exact. */
  sourceWindow: z.object({ start: Instant, end: Instant }).strict(),
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
  caveats: CaveatsSchema,
});

export const WithheldReasonSchema = z.enum(["missing-moderation", "rights-unreviewed", "no-eligible-observations", "all-cells-below-threshold"]);
export type WithheldReason = z.infer<typeof WithheldReasonSchema>;

export const ObservationAggregateSchema = z.discriminatedUnion("state", [
  AggregateBaseSchema.extend({
    state: z.literal("published"),
    provenance: PublishedProvenanceSchema,
    /** Cells below `minReportsPerCell`; only the number is public, never where they were. */
    withheldCellCount: z.number().int().nonnegative(),
    cells: z.array(AggregateCellSchema).min(1),
  }).strict().refine((item) => item.provenance.moderation.status === "attested" && item.provenance.rightsReviewed,
    { message: "published output requires attested moderation and a rights review", path: ["state"] }),
  /** Minimal on purpose: no counts, no times, no cells. Details live in the private audit. */
  AggregateBaseSchema.extend({
    state: z.literal("withheld"),
    reason: WithheldReasonSchema,
    provenance: WithheldProvenanceSchema,
    cells: z.array(AggregateCellSchema).length(0),
  }).strict(),
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
  offeredObservationCount: z.number().int().nonnegative(),
  countedObservationCount: z.number().int().nonnegative(),
  /** Exact publisher/resident clocks of the counted inputs. Private: exact times correlate to people. */
  sourceTimes: z.object({
    earliestObservedAt: Instant.nullable(),
    latestObservedAt: Instant.nullable(),
    earliestPublishedAt: Instant.nullable(),
    latestPublishedAt: Instant.nullable(),
  }).strict(),
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
  // Half-open on the max edge: a point exactly on east/north would floor into a cell outside coverage.
  return longitude >= west && longitude < east && latitude >= south && latitude < north;
}

function countBin(count: number): z.infer<typeof CountBin> {
  return count >= 10 ? "10+" : count >= 6 ? "6-9" : "3-5";
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
  const { config, moderation, now, rightsReviewed } = input;
  const nowMs = Date.parse(now);
  // Ids are unique (schema) so id order is a total order: every later step is independent of input order.
  const observations = [...input.observations].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const inputObservationIds = observations.map((item) => item.id);
  const excluded: { id: string; reason: ExclusionReason }[] = [];
  const counted: typeof input.observations = [];
  const cellSizeMeters = config.cellSizeDegrees * METERS_PER_DEGREE;
  const attestedAtMs = moderation.status === "attested" ? Date.parse(moderation.attestedAt) : null;

  for (const item of observations) {
    const exclude = (reason: ExclusionReason) => excluded.push({ id: item.id, reason });
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
  const effectiveTimes = counted.map((item) => Date.parse(item.observedAt ?? item.publishedAt));
  const iso = (values: number[], pick: (...v: number[]) => number) => values.length ? new Date(pick(...values)).toISOString() : null;
  const exclusionCounts = Object.fromEntries(ExclusionReasonSchema.options.map((reason) =>
    [reason, excluded.filter((item) => item.reason === reason).length])) as Record<ExclusionReason, number>;
  const binMs = config.timeBinSeconds * 1000;
  const binStartOf = (ms: number) => Math.floor(ms / binMs) * binMs;

  const base = {
    version: 1 as const, kind: "community-observation-aggregate" as const, generatedAt: now,
    verification: "unverified" as const, allClear: false as const,
    usage: { routingHazardInput: false as const, officialAuthority: false as const, boundaryOrModelEstimate: false as const },
    caveats: AGGREGATE_CAVEATS,
  };
  const withheldProvenance = { config, moderation, rightsReviewed };
  const finish = (aggregate: unknown, withheldCellCount: number): AggregationResult => ({
    aggregate: ObservationAggregateSchema.parse(aggregate),
    audit: AggregationAuditSchema.parse({
      audience: "private-audit", generatedAt: now, configVersion: config.configVersion,
      inputObservationIds, excluded,
      offeredObservationCount: input.observations.length, countedObservationCount: counted.length,
      sourceTimes: {
        earliestObservedAt: iso(observedTimes, Math.min), latestObservedAt: iso(observedTimes, Math.max),
        earliestPublishedAt: iso(publishedTimes, Math.min), latestPublishedAt: iso(publishedTimes, Math.max),
      },
      withheldCellCount,
    }),
  });
  const withheld = (reason: WithheldReason, withheldCellCount: number) =>
    finish({ ...base, state: "withheld", reason, provenance: withheldProvenance, cells: [] }, withheldCellCount);

  if (moderation.status !== "attested") return withheld("missing-moderation", 0);
  if (!rightsReviewed) return withheld("rights-unreviewed", 0);
  if (counted.length === 0) return withheld("no-eligible-observations", 0);

  const groups = new Map<string, typeof counted>();
  for (const item of counted) {
    const point = item.approximatePoint as [number, number];
    const { ix, iy } = cellIndex(config, point);
    const binStart = binStartOf(Date.parse(item.observedAt ?? item.publishedAt));
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
      verification: "unverified",
    });
  }
  if (cells.length === 0) return withheld("all-cells-below-threshold", withheldCellCount);
  const provenance: z.infer<typeof PublishedProvenanceSchema> = {
    ...withheldProvenance,
    offeredObservationCount: input.observations.length,
    countedObservationCount: counted.length,
    exclusionCounts,
    sourceWindow: {
      start: new Date(binStartOf(Math.min(...effectiveTimes))).toISOString(),
      end: new Date(binStartOf(Math.max(...effectiveTimes)) + binMs).toISOString(),
    },
    uniqueReporterDedupe: "not-possible",
  };
  return finish({ ...base, state: "published", provenance, withheldCellCount, cells }, withheldCellCount);
}
