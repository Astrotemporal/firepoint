import { describe, expect, it } from "vitest";
import { getActiveHazards } from "./hazards";

describe("hazard stub", () => {
  it("ships no demo or simulated fires, and returns a stable empty list", () => {
    expect(getActiveHazards()).toEqual([]);
    expect(getActiveHazards()).toBe(getActiveHazards());
  });
});
