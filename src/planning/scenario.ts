import { z } from "zod";

/** Planning-only contract. No scenario raster, model runner or map layer exists in Firepoint. */
const Instant = z.iso.datetime({ offset: true });
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const SourceUrl = z.url().refine((url) => new URL(url).protocol === "https:", "source URL must be HTTPS");
const Minutes = z.number().finite().nonnegative();
const PositiveMinutes = Minutes.positive();

const InputSourceSchema = z.object({
  sourceName: z.string().min(1),
  sourceUrl: SourceUrl,
  vintage: z.string().min(1), // e.g. a dataset edition, not a fabricated current timestamp
  retrievedAt: Instant,
});

export const WindRunSchema = z.object({
  runId: z.string().min(1),
  model: z.literal("WindNinja"),
  version: z.string().min(1),
  solver: z.enum(["mass-conserving", "momentum"]),
  configurationSha256: Sha256,
  outputGridSha256: Sha256,
  runAt: Instant,
  initialization: InputSourceSchema.extend({ cycleAt: Instant, validAt: Instant }),
  terrain: InputSourceSchema,
});
export type WindRun = z.infer<typeof WindRunSchema>;

export const FireArrivalRunSchema = z.object({
  runId: z.string().min(1),
  model: z.literal("ELMFIRE"),
  version: z.string().min(1),
  configurationSha256: Sha256,
  outputToaSha256: Sha256,
  runAt: Instant,
  windRunId: z.string().min(1),
  simulationHorizonMin: PositiveMinutes,
  ignitionSource: InputSourceSchema,
  fuels: InputSourceSchema,
  spotting: z.enum(["modeled", "not-modeled"]),
});
export type FireArrivalRun = z.infer<typeof FireArrivalRunSchema>;

export const ClearanceMethodSchema = z.object({
  method: z.string().min(1),
  version: z.string().min(1),
  configurationSha256: Sha256,
  households: InputSourceSchema,
  vehicleAssumptions: InputSourceSchema,
  exitCapacity: InputSourceSchema,
});
export type ClearanceMethod = z.infer<typeof ClearanceMethodSchema>;

const ValidationRecordSchema = z.object({
  reportUrl: SourceUrl,
  reviewedAt: Instant,
  outcome: z.enum(["accepted", "pending", "rejected"]),
  validatedConfigurationSha256: Sha256,
});
const ValidationRefsSchema = z.object({
  windHindcast: ValidationRecordSchema.nullable(),
  fireHindcast: ValidationRecordSchema.nullable(),
  clearanceReview: ValidationRecordSchema.nullable(),
});

export const PlanningCellSchema = z.object({
  scenarioId: z.string().min(1),
  cellId: z.string().min(1), // identifier only; no circle, zone polygon or resident point
  timeOfArrivalMin: Minutes.nullable(), // null if no model output for this cell
  clearanceTimeMin: PositiveMinutes,
  safetyMarginMin: PositiveMinutes,
  alertDelay: z.object({ minutes: Minutes, method: InputSourceSchema }),
  evaluatedAt: Instant,
  maxRunAgeMin: PositiveMinutes, // explicit scenario currency policy, NOT a live forecast guarantee
  wind: WindRunSchema,
  fire: FireArrivalRunSchema,
  clearance: ClearanceMethodSchema,
  validation: ValidationRefsSchema,
}).superRefine((scenario, ctx) => {
  if (scenario.fire.windRunId !== scenario.wind.runId) {
    ctx.addIssue({ code: "custom", path: ["fire", "windRunId"], message: "fire run references a different wind field" });
  }
  const windAt = Date.parse(scenario.wind.runAt);
  const fireAt = Date.parse(scenario.fire.runAt);
  const evaluatedAt = Date.parse(scenario.evaluatedAt);
  if (fireAt < windAt || fireAt > evaluatedAt) {
    ctx.addIssue({ code: "custom", path: ["fire", "runAt"], message: "wind run <= fire run <= evaluation time is required" });
  }
  if (Date.parse(scenario.wind.initialization.validAt) < Date.parse(scenario.wind.initialization.cycleAt)) {
    ctx.addIssue({ code: "custom", path: ["wind", "initialization", "validAt"], message: "valid time cannot predate its forecast cycle" });
  }
  if (scenario.timeOfArrivalMin !== null && scenario.timeOfArrivalMin > scenario.fire.simulationHorizonMin) {
    ctx.addIssue({ code: "custom", path: ["timeOfArrivalMin"], message: "arrival exceeds the modeled simulation horizon" });
  }
  for (const [path, retrievedAt, latest] of [
    [["wind", "initialization"], scenario.wind.initialization.retrievedAt, windAt],
    [["wind", "terrain"], scenario.wind.terrain.retrievedAt, windAt],
    [["fire", "ignitionSource"], scenario.fire.ignitionSource.retrievedAt, fireAt],
    [["fire", "fuels"], scenario.fire.fuels.retrievedAt, fireAt],
    [["clearance", "households"], scenario.clearance.households.retrievedAt, evaluatedAt],
    [["clearance", "vehicleAssumptions"], scenario.clearance.vehicleAssumptions.retrievedAt, evaluatedAt],
    [["clearance", "exitCapacity"], scenario.clearance.exitCapacity.retrievedAt, evaluatedAt],
    [["alertDelay", "method"], scenario.alertDelay.method.retrievedAt, evaluatedAt],
  ] as const) {
    if (Date.parse(retrievedAt) > latest) {
      ctx.addIssue({ code: "custom", path: [...path, "retrievedAt"], message: "an input cannot be retrieved after its run/evaluation" });
    }
  }
  for (const [name, review, earliest] of [
    ["windHindcast", scenario.validation.windHindcast, windAt],
    ["fireHindcast", scenario.validation.fireHindcast, fireAt],
    ["clearanceReview", scenario.validation.clearanceReview, 0],
  ] as const) {
    if (review && (Date.parse(review.reviewedAt) < earliest || Date.parse(review.reviewedAt) > evaluatedAt)) {
      ctx.addIssue({ code: "custom", path: ["validation", name, "reviewedAt"], message: "review must follow its run and predate evaluation" });
    }
  }
});
export type PlanningCell = z.infer<typeof PlanningCellSchema>;

const DISCLAIMER = "Planning projection, not a forecast or evacuation order." as const;
const CAVEATS = [
  "Lee-canyon Santa Ana winds can be underpredicted.",
  "Fuel data can miss recent burns, treatments and development.",
  "Ember spotting can bring fire ahead of the modeled front.",
  "Arrival starts at modeled ignition; notification and mobilization delays require cited assumptions.",
] as const;

export const PlanningEvaluationSchema = z.object({
  kind: z.literal("planning-projection"),
  scenarioId: z.string().min(1),
  cellId: z.string().min(1),
  status: z.enum(["unavailable", "modeled-clearance-deficit", "modeled-within-safety-margin", "modeled-margin-met-under-assumptions"]),
  reason: z.enum(["no-arrival-output", "stale-run", "missing-validation", "validation-not-accepted", "validation-mismatch"]).nullable(),
  /** Minutes from ignition in the cited model run, never an operational clock. Null if unavailable. */
  timeOfArrivalMin: Minutes.nullable(),
  clearanceTimeMin: PositiveMinutes,
  safetyMarginMin: PositiveMinutes,
  alertDelayMin: Minutes,
  evaluatedAt: Instant,
  maxRunAgeMin: PositiveMinutes,
  /** Modeled arrival minus clearance and margin. Not an operational evacuation clock. */
  modeledSlackMin: z.number().finite().nullable(),
  disclaimer: z.literal(DISCLAIMER),
  caveats: z.tuple([z.literal(CAVEATS[0]), z.literal(CAVEATS[1]), z.literal(CAVEATS[2]), z.literal(CAVEATS[3])]),
  provenance: z.object({ wind: WindRunSchema, fire: FireArrivalRunSchema,
    clearance: ClearanceMethodSchema, alertDelayMethod: InputSourceSchema, validation: ValidationRefsSchema }),
});
export type PlanningEvaluation = z.infer<typeof PlanningEvaluationSchema>;

/** Pure comparison of already-cited model outputs. It neither runs WindNinja/ELMFIRE nor draws zones. */
export function evaluatePlanningCell(raw: unknown): PlanningEvaluation {
  const cell = PlanningCellSchema.parse(raw);
  const base = { kind: "planning-projection" as const, scenarioId: cell.scenarioId, cellId: cell.cellId,
    disclaimer: DISCLAIMER, caveats: [...CAVEATS],
    clearanceTimeMin: cell.clearanceTimeMin, safetyMarginMin: cell.safetyMarginMin,
    alertDelayMin: cell.alertDelay.minutes, evaluatedAt: cell.evaluatedAt,
    maxRunAgeMin: cell.maxRunAgeMin,
    provenance: { wind: cell.wind, fire: cell.fire, clearance: cell.clearance,
      alertDelayMethod: cell.alertDelay.method, validation: cell.validation } };
  // Never expose an unvalidated or stale TOA for a consumer to turn into an unsupported "safe" margin.
  const unavailable = (reason: "no-arrival-output" | "stale-run" | "missing-validation" | "validation-not-accepted" | "validation-mismatch") =>
    PlanningEvaluationSchema.parse({ ...base, status: "unavailable", reason, timeOfArrivalMin: null, modeledSlackMin: null });
  if (cell.timeOfArrivalMin === null) return unavailable("no-arrival-output");
  if (Date.parse(cell.evaluatedAt) - Date.parse(cell.fire.runAt) > cell.maxRunAgeMin * 60_000) return unavailable("stale-run");
  const reviews = [
    [cell.validation.windHindcast, cell.wind.configurationSha256],
    [cell.validation.fireHindcast, cell.fire.configurationSha256],
    [cell.validation.clearanceReview, cell.clearance.configurationSha256],
  ] as const;
  if (reviews.some(([review]) => review === null)) return unavailable("missing-validation");
  if (reviews.some(([review]) => review?.outcome !== "accepted")) return unavailable("validation-not-accepted");
  if (reviews.some(([review, configurationSha256]) => review?.validatedConfigurationSha256 !== configurationSha256)) {
    return unavailable("validation-mismatch");
  }
  // All times are relative to the same modeled ignition; the delay must be sourced separately.
  const gap = cell.timeOfArrivalMin - cell.alertDelay.minutes - cell.clearanceTimeMin;
  const slack = gap - cell.safetyMarginMin;
  const status = gap < 0 ? "modeled-clearance-deficit"
    : gap < cell.safetyMarginMin ? "modeled-within-safety-margin"
    : "modeled-margin-met-under-assumptions";
  return PlanningEvaluationSchema.parse({ ...base, timeOfArrivalMin: cell.timeOfArrivalMin,
    status, reason: null, modeledSlackMin: slack });
}
