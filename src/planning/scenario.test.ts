import { describe, expect, it } from "vitest";
import { PlanningCellSchema, evaluatePlanningCell } from "./scenario";

// Conspicuously SYNTHETIC TEST ONLY: these are not model runs or UI data.
const at = "2026-01-01T00:00:00Z";
const later = "2026-01-01T01:00:00Z";
const hash = "a".repeat(64);
const input = (name: string) => ({ sourceName: `SYNTHETIC TEST ONLY ${name}`,
  sourceUrl: `https://example.org/synthetic-test/${name}`, vintage: "SYNTHETIC TEST EDITION", retrievedAt: at });
const base = {
  scenarioId: "SYNTHETIC-TEST-SCENARIO", cellId: "SYNTHETIC-TEST-CELL", timeOfArrivalMin: 60,
  clearanceTimeMin: 45, safetyMarginMin: 10,
  wind: { runId: "SYNTHETIC-WIND", model: "WindNinja", version: "TEST-ONLY",
    solver: "mass-conserving", configurationSha256: hash, outputGridSha256: hash, runAt: at,
    initialization: { ...input("wind-init"), cycleAt: at, validAt: later }, terrain: input("DEM") },
  fire: { runId: "SYNTHETIC-FIRE", model: "ELMFIRE", version: "TEST-ONLY",
    configurationSha256: hash, outputToaSha256: hash, runAt: later,
    windRunId: "SYNTHETIC-WIND", ignitionSource: input("ignition"), fuels: input("fuels"),
    spotting: "not-modeled" },
  clearance: { method: "SYNTHETIC TEST ONLY", version: "TEST-ONLY",
    households: input("households"), vehicleAssumptions: input("vehicles"), exitCapacity: input("exits") },
  validation: { windHindcastUrl: "https://example.org/synthetic-test/wind-hindcast",
    fireHindcastUrl: "https://example.org/synthetic-test/fire-hindcast",
    clearanceReviewUrl: "https://example.org/synthetic-test/clearance-review" },
};

describe("planning-only model comparison", () => {
  it("preserves provenance and never returns an order, color, polygon, or all-clear", () => {
    const result = evaluatePlanningCell(base);
    expect(result).toMatchObject({ kind: "planning-projection", status: "modeled-clearance-margin-available",
      modeledSlackMin: 5, timeOfArrivalMin: 60, clearanceTimeMin: 45, safetyMarginMin: 10,
      reason: null, provenance: { wind: { model: "WindNinja", runId: "SYNTHETIC-WIND" },
        fire: { model: "ELMFIRE", windRunId: "SYNTHETIC-WIND" },
        validation: { windHindcastUrl: base.validation.windHindcastUrl } } });
    expect(result.disclaimer).toBe("Planning projection, not a forecast or evacuation order.");
    expect(result.caveats).toEqual(expect.arrayContaining([expect.stringMatching(/Ember spotting/)]));
    for (const field of ["color", "radius", "geometry", "evacuationStatus", "allClear"]) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it.each([
    [30, "modeled-clearance-deficit", -25],
    [50, "modeled-within-safety-margin", -5],
    [55, "modeled-clearance-margin-available", 0],
  ])("classifies only modeled time comparison for TOA %i", (timeOfArrivalMin, status, slack) => {
    const result = evaluatePlanningCell({ ...base, timeOfArrivalMin });
    expect(result.status).toBe(status);
    expect(result.modeledSlackMin).toBe(slack);
  });

  it("makes no estimate when arrival output or validation is missing", () => {
    expect(evaluatePlanningCell({ ...base, timeOfArrivalMin: null })).toMatchObject({
      status: "unavailable", reason: "no-arrival-output", modeledSlackMin: null });
    expect(evaluatePlanningCell({ ...base, validation: { ...base.validation, windHindcastUrl: null } }))
      .toMatchObject({ status: "unavailable", reason: "missing-validation", modeledSlackMin: null });
  });

  it("rejects cross-run wind, missing sources, invalid units and non-HTTPS provenance", () => {
    expect(() => PlanningCellSchema.parse({ ...base, fire: { ...base.fire, windRunId: "OTHER" } })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, clearanceTimeMin: -1 })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, timeOfArrivalMin: Number.NaN })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, wind: { ...base.wind, terrain: { ...input("DEM"), sourceUrl: "http://example.org/" } } })).toThrow();
    expect(() => evaluatePlanningCell({ ...base, fire: { ...base.fire, runAt: "2025-12-31T23:00:00Z" } })).toThrow();
  });
});
