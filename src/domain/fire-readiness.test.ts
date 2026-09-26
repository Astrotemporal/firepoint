import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CHECK_ITEMS, PACK_ITEMS, PLAN_ITEMS, STAGES, parseSavedChecks } from "./fire-readiness";

describe("fire readiness content", () => {
  it("keeps the original prep task ids so saved checks still load", () => {
    expect(PLAN_ITEMS.map((item) => item.id)).toEqual(["contacts", "medication", "route", "alerts"]);
    expect(parseSavedChecks('["contacts","alerts"]')).toEqual(["contacts", "alerts"]);
  });

  it("drops unknown or malformed saved values", () => {
    expect(parseSavedChecks('["water","nope",3]')).toEqual(["water"]);
    expect(parseSavedChecks('{"water":true}')).toEqual([]);
    expect(parseSavedChecks("not json")).toEqual([]);
    expect(parseSavedChecks(null)).toEqual([]);
  });

  it("uses unique checklist ids", () => {
    const ids = CHECK_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PACK_ITEMS.length).toBeGreaterThanOrEqual(12);
  });

  it("orders stages Ready, Set, Go and cites an official source for each", () => {
    expect(STAGES.map((stage) => stage.id)).toEqual(["ready", "set", "go"]);
    for (const stage of STAGES) {
      expect(stage.sources.length).toBeGreaterThan(0);
      for (const source of stage.sources) expect(source.url).toMatch(/^https:\/\/(www\.)?(readyforwildfire\.org|ready\.gov)\//);
    }
  });

  it("puts official instructions first when leaving, and never claims an order or all-clear", () => {
    const go = STAGES.find((stage) => stage.id === "go")!;
    expect(go.steps[0].label).toMatch(/official/i);
    const text = JSON.stringify(STAGES).toLowerCase();
    expect(text).not.toMatch(/you are (safe|clear)|all[- ]clear|no need to (leave|evacuate)/);
  });

  it("mirrors every item and step in the offline page", () => {
    const offline = readFileSync("public/offline.html", "utf8");
    for (const item of CHECK_ITEMS) {
      expect(offline).toContain(`"${item.id}"`);
      expect(offline).toContain(item.label);
    }
    for (const stage of STAGES) for (const step of stage.steps) expect(offline).toContain(step.label);
  });
});
