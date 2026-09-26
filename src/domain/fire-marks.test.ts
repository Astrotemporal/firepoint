import { describe, expect, it } from "vitest";
import { MAX_MARKS, addMark, createMark, moveMark, parseMarks } from "./fire-marks";

describe("personal fire marks", () => {
  it("drops unreadable storage instead of guessing", () => {
    expect(parseMarks(null)).toEqual([]);
    expect(parseMarks("not json")).toEqual([]);
    expect(parseMarks('{"lat":1}')).toEqual([]);
    const good = createMark(34.17, -118.24);
    expect(parseMarks(JSON.stringify([good, { id: "x", lat: 200, lng: 0, placedAt: good.placedAt }]))).toEqual([good]);
  });

  it("caps stored marks, keeping the newest", () => {
    let marks = [createMark(34, -118)];
    for (let i = 0; i < MAX_MARKS; i++) marks = addMark(marks, createMark(34 + i / 100, -118));
    expect(marks).toHaveLength(MAX_MARKS);
    expect(marks[0].lat).toBe(34);
    expect(marks.at(-1)?.lat).toBeCloseTo(34 + (MAX_MARKS - 1) / 100);
  });

  it("moves only the dragged mark and wraps longitude", () => {
    const a = createMark(34, -118);
    const b = createMark(35, -117);
    const moved = moveMark([a, b], b.id, 36, 190);
    expect(moved[0]).toEqual(a);
    expect(moved[1]).toMatchObject({ lat: 36, lng: -170 });
  });
});

describe("fire mark edge cases", () => {
  it("refuses coordinates off the globe", () => {
    expect(() => createMark(91, 0)).toThrow();
    expect(() => createMark(Number.NaN, 0)).toThrow();
  });

  it("folds wrapped longitudes on creation, in both directions", () => {
    expect(createMark(0, 190).lng).toBeCloseTo(-170);
    expect(createMark(0, -190).lng).toBeCloseTo(170);
    expect(createMark(0, 540).lng).toBeCloseTo(-180);
  });

  it("stamps the placement time it was given", () => {
    const now = new Date("2026-09-26T19:00:00.000Z");
    expect(createMark(34, -118, now).placedAt).toBe("2026-09-26T19:00:00.000Z");
  });

  it("gives every mark its own id", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createMark(34, -118).id));
    expect(ids.size).toBe(50);
  });

  it("trims oversized storage to the newest marks", () => {
    const marks = Array.from({ length: MAX_MARKS + 5 }, (_, i) => createMark(i, 0));
    const parsed = parseMarks(JSON.stringify(marks));
    expect(parsed).toHaveLength(MAX_MARKS);
    expect(parsed[0].lat).toBe(5);
  });

  it("leaves marks untouched when moving an unknown id", () => {
    const a = createMark(34, -118);
    expect(moveMark([a], "missing", 0, 0)).toEqual([a]);
  });
});
