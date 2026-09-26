import { describe, expect, it } from "vitest";
import data from "./recent-shelters.json";

describe("recent disaster shelters reference", () => {
  it("says these are past activations, not shelters that are open now", () => {
    expect(data.about).toMatch(/PAST activations/);
    expect(data.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("gives every entry a unique id, a known kind, a date and a cited source", () => {
    const ids = data.shelters.map((shelter) => shelter.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shelter of data.shelters) {
      expect(Object.keys(data.kinds)).toContain(shelter.kind);
      expect(shelter.openedOn).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
      expect(shelter.sources.length).toBeGreaterThan(0);
      for (const source of shelter.sources) expect(source.url).toMatch(/^https:\/\//);
    }
  });

  it("places every site in the Los Angeles area", () => {
    for (const shelter of data.shelters) {
      expect(shelter.lat).toBeGreaterThan(33.7);
      expect(shelter.lat).toBeLessThan(34.8);
      expect(shelter.lng).toBeGreaterThan(-118.8);
      expect(shelter.lng).toBeLessThan(-117.6);
    }
  });
});
