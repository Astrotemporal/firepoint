import { describe, expect, it } from "vitest";
import { PlanningCellSchema, evaluatePlanningCell } from "./scenario";

// Conspicuously SYNTHETIC TEST ONLY: these are not model runs or UI data.
const at = "2026-01-01T00:00:00Z";
const later = "2026-01-01T01:00:00Z";
const reviewed = "2026-01-01T02:00:00Z";
const evaluated = "2026-01-01T03:00:00Z";
const hash = "a".repeat(64);
const otherHash = "b".repeat(64);
const input = (name: string) => ({ sourceName: `SYNTHETIC TEST ONLY ${name}`,
  sourceUrl: `https://example.org/synthetic-test/${name}`, vintage: "SYNTHETIC TEST EDITION", retrievedAt: at });
const review = (name: string) => ({ reportUrl: `https://example.org/synthetic-test/${name}-review`,
  reviewedAt: reviewed, outcome: "accepted", validatedConfigurationSha256: hash });
const base = {
  scenarioId: "SYNTHETIC-TEST-SCENARIO", cellId: "SYNTHETIC-TEST-CELL", timeOfArrivalMin: 60,
  clearanceTimeMin: 45, safetyMarginMin: 10, alertDelay: { minutes: 5, method: input("alert-delay") },
  evaluatedAt: evaluated, maxRunAgeMin: 180,
  wind: { runId: "SYNTHETIC-WIND", model: "WindNinja", version: "TEST-ONLY",
    solver: "mass-conserving", configurationSha256: hash, outputGridSha256: hash, runAt: at,
    initialization: { ...input("wind-init"), cycleAt: at, validAt: later }, terrain: input("DEM") },
  fire: { runId: "SYNTHETIC-FIRE", model: "ELMFIRE", version: "TEST-ONLY",
    configurationSha256: hash, outputToaSha256: hash, runAt: later, simulationHorizonMin: 120,
    windRunId: "SYNTHETIC-WIND", ignitionSource: input("ignition"), fuels: input("fuels"),
    spotting: "not-modeled" },
  clearance: { method: "SYNTHETIC TEST ONLY", version: "TEST-ONLY", configurationSha256: hash,
    households: input("households"), vehicleAssumptions: input("vehicles"), exitCapacity: input("exits") },
  validation: { windHindcast: review("wind"), fireHindcast: review("fire"),
    clearanceReview: review("clearance") },
};

describe("planning-only model comparison", () => {
  it("preserves dated inputs and reviews without returning orders, colors, polygons or an all-clear", () => {
    const result = evaluatePlanningCell(base);
    expect(result).toMatchObject({ kind: "planning-projection", status: "modeled-margin-met-under-assumptions",
      modeledSlackMin: 0, timeOfArrivalMin: 60, clearanceTimeMin: 45, safetyMarginMin: 10,
      alertDelayMin: 5, reason: null, evaluatedAt: evaluated,
      provenance: { wind: { model: "WindNinja", runId: "SYNTHETIC-WIND" },
        fire: { model: "ELMFIRE", windRunId: "SYNTHETIC-WIND" },
        validation: { windHindcast: { validatedConfigurationSha256: hash } },
        alertDelayMethod: { sourceName: "SYNTHETIC TEST ONLY alert-delay" } } });
    expect(result.disclaimer).toBe("Planning projection, not a forecast or evacuation order.");
    expect(result.caveats).toEqual(expect.arrayContaining([expect.stringMatching(/notification and mobilization delays/)]));
    for (const field of ["color", "radius", "geometry", "evacuationStatus", "allClear"]) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it.each([
    [30, "modeled-clearance-deficit", -30],
    [50, "modeled-within-safety-margin", -10], // equality with adjusted clearance is NOT a surplus
    [52, "modeled-within-safety-margin", -8],
    [60, "modeled-margin-met-under-assumptions", 0],
  ])("classifies only modeled time comparisons for TOA %i", (timeOfArrivalMin, status, slack) => {
    const result = evaluatePlanningCell({ ...base, timeOfArrivalMin });
    expect(result.status).toBe(status);
    expect(result.modeledSlackMin).toBe(slack);
  });

  it("a longer cited detection/alert delay removes a previously apparent margin", () => {
    expect(evaluatePlanningCell({ ...base, alertDelay: { ...base.alertDelay, minutes: 20 } }))
      .toMatchObject({ status: "modeled-clearance-deficit", modeledSlackMin: -15 });
  });

  it("does not expose a stale, unvalidated or absent arrival value as a usable margin", () => {
    expect(evaluatePlanningCell({ ...base, timeOfArrivalMin: null }))
      .toMatchObject({ status: "unavailable", reason: "no-arrival-output", timeOfArrivalMin: null, modeledSlackMin: null });
    expect(evaluatePlanningCell({ ...base, evaluatedAt: "2026-01-01T05:00:00Z" }))
      .toMatchObject({ status: "unavailable", reason: "stale-run", timeOfArrivalMin: null, modeledSlackMin: null });
    for (const field of ["windHindcast", "fireHindcast", "clearanceReview"] as const) {
      expect(evaluatePlanningCell({ ...base, validation: { ...base.validation, [field]: null } }))
        .toMatchObject({ status: "unavailable", reason: "missing-validation", timeOfArrivalMin: null });
      expect(evaluatePlanningCell({ ...base, validation: { ...base.validation,
        [field]: { ...base.validation[field], outcome: "pending" } } }))
        .toMatchObject({ status: "unavailable", reason: "validation-not-accepted", timeOfArrivalMin: null });
      expect(evaluatePlanningCell({ ...base, validation: { ...base.validation,
        [field]: { ...base.validation[field], outcome: "rejected" } } }))
        .toMatchObject({ status: "unavailable", reason: "validation-not-accepted", timeOfArrivalMin: null });
      expect(evaluatePlanningCell({ ...base, validation: { ...base.validation,
        [field]: { ...base.validation[field], validatedConfigurationSha256: otherHash } } }))
        .toMatchObject({ status: "unavailable", reason: "validation-mismatch", timeOfArrivalMin: null });
    }
  });

  it("rejects cross-run wind, impossible source/review times, horizon and invalid units", () => {
    expect(() => PlanningCellSchema.parse({ ...base, fire: { ...base.fire, windRunId: "OTHER" } })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, clearanceTimeMin: 0 })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, safetyMarginMin: 0 })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, timeOfArrivalMin: Number.NaN })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, timeOfArrivalMin: 121 })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, wind: { ...base.wind,
      initialization: { ...base.wind.initialization, cycleAt: later, validAt: at } } })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, fire: { ...base.fire, windRunId: "OTHER" } })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, fire: { ...base.fire,
      fuels: { ...input("fuels"), retrievedAt: reviewed } } })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, wind: { ...base.wind,
      terrain: { ...input("DEM"), sourceUrl: "http://example.org/" } } })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, validation: { ...base.validation,
      fireHindcast: { ...base.validation.fireHindcast, reviewedAt: "2026-01-01T04:00:00Z" } } })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, fire: { ...base.fire, runAt: "2025-12-31T23:00:00Z" } })).toThrow();
  });
});
