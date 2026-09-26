import { z } from "zod";

/** Planning-only contract. No scenario raster, model runner or map layer exists in Firepoint. */
const Instant = z.iso.datetime({ offset: true });
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const SourceUrl = z.url().refine((url) => new URL(url).protocol === "https:", "source URL must be HTTPS");
const Minutes = z.number().finite().nonnegative();

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
  ignitionSource: InputSourceSchema,
  fuels: InputSourceSchema,
  spotting: z.enum(["modeled", "not-modeled"]),
});
export type FireArrivalRun = z.infer<typeof FireArrivalRunSchema>;

export const ClearanceMethodSchema = z.object({
  method: z.string().min(1),
  version: z.string().min(1),
  households: InputSourceSchema,
  vehicleAssumptions: InputSourceSchema,
  exitCapacity: InputSourceSchema,
});
export type ClearanceMethod = z.infer<typeof ClearanceMethodSchema>;

const ValidationRefsSchema = z.object({
  windHindcastUrl: SourceUrl.nullable(),
  fireHindcastUrl: SourceUrl.nullable(),
  clearanceReviewUrl: SourceUrl.nullable(),
});

export const PlanningCellSchema = z.object({
  scenarioId: z.string().min(1),
  cellId: z.string().min(1), // identifier only; no circle, zone polygon or resident point
  timeOfArrivalMin: Minutes.nullable(), // null if no validated model output for this cell
  clearanceTimeMin: Minutes,
  safetyMarginMin: Minutes,
  wind: WindRunSchema,
  fire: FireArrivalRunSchema,
  clearance: ClearanceMethodSchema,
  validation: ValidationRefsSchema,
}).superRefine((scenario, ctx) => {
  if (scenario.fire.windRunId !== scenario.wind.runId) {
    ctx.addIssue({ code: "custom", path: ["fire", "windRunId"], message: "fire run references a different wind field" });
  }
  if (Date.parse(scenario.fire.runAt) < Date.parse(scenario.wind.runAt)) {
    ctx.addIssue({ code: "custom", path: ["fire", "runAt"], message: "fire run cannot predate its wind field" });
  }
});
export type PlanningCell = z.infer<typeof PlanningCellSchema>;

const DISCLAIMER = "Planning projection, not a forecast or evacuation order." as const;
const CAVEATS = [
  "Lee-canyon Santa Ana winds can be underpredicted.",
  "Fuel data can miss recent burns, treatments and development.",
  "Ember spotting can bring fire ahead of the modeled front.",
] as const;

export const PlanningEvaluationSchema = z.object({
  kind: z.literal("planning-projection"),
  scenarioId: z.string().min(1),
  cellId: z.string().min(1),
  status: z.enum(["unavailable", "modeled-clearance-deficit", "modeled-within-safety-margin", "modeled-clearance-margin-available"]),
  reason: z.enum(["no-arrival-output", "missing-validation"]).nullable(),
  /** Minutes from ignition in the cited model run, not a live clock. */
  timeOfArrivalMin: Minutes.nullable(),
  clearanceTimeMin: Minutes,
  safetyMarginMin: Minutes,
  /** Modeled arrival minus clearance and margin. Not an operational evacuation clock. */
  modeledSlackMin: z.number().finite().nullable(),
  disclaimer: z.literal(DISCLAIMER),
  caveats: z.array(z.string().min(1)).min(3),
  provenance: z.object({ wind: WindRunSchema, fire: FireArrivalRunSchema,
    clearance: ClearanceMethodSchema, validation: ValidationRefsSchema }),
});
export type PlanningEvaluation = z.infer<typeof PlanningEvaluationSchema>;

/** Pure comparison of already-cited model outputs. It neither runs WindNinja/ELMFIRE nor draws zones. */
export function evaluatePlanningCell(raw: unknown): PlanningEvaluation {
  const cell = PlanningCellSchema.parse(raw);
  const base = { kind: "planning-projection" as const, scenarioId: cell.scenarioId, cellId: cell.cellId,
    disclaimer: DISCLAIMER, caveats: [...CAVEATS],
    timeOfArrivalMin: cell.timeOfArrivalMin, clearanceTimeMin: cell.clearanceTimeMin,
    safetyMarginMin: cell.safetyMarginMin,
    provenance: { wind: cell.wind, fire: cell.fire, clearance: cell.clearance, validation: cell.validation } };
  if (cell.timeOfArrivalMin === null) return PlanningEvaluationSchema.parse({ ...base,
    status: "unavailable", reason: "no-arrival-output", modeledSlackMin: null });
  if (Object.values(cell.validation).some((url) => url === null)) return PlanningEvaluationSchema.parse({ ...base,
    status: "unavailable", reason: "missing-validation", modeledSlackMin: null });
  const gap = cell.timeOfArrivalMin - cell.clearanceTimeMin;
  const slack = gap - cell.safetyMarginMin;
  const status = gap < 0 ? "modeled-clearance-deficit"
    : gap < cell.safetyMarginMin ? "modeled-within-safety-margin"
    : "modeled-clearance-margin-available";
  return PlanningEvaluationSchema.parse({ ...base, status, reason: null, modeledSlackMin: slack });
}
