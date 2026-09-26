import { describe, expect, it } from "vitest";
import { MAX_MARKS } from "./fire-marks";
import { estimateFire, formatDistance, type LatLng } from "./triangulation";

const CENTER = { lat: 34.165, lng: -118.255 };
const M_PER_DEG_LAT = 111_195;

// Independent of the implementation's projection: great-circle distance in metres.
function haversine(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// Three points 500 m north, east and south of CENTER.
function onCircle(radiusM: number): LatLng[] {
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLng = radiusM / (M_PER_DEG_LAT * Math.cos((CENTER.lat * Math.PI) / 180));
  return [
    { lat: CENTER.lat + dLat, lng: CENTER.lng },
    { lat: CENTER.lat, lng: CENTER.lng + dLng },
    { lat: CENTER.lat - dLat, lng: CENTER.lng },
  ];
}

describe("fire triangulation", () => {
  it("needs exactly three marks, which is the mark cap", () => {
    expect(MAX_MARKS).toBe(3);
    expect(estimateFire([])).toBeNull();
    expect(estimateFire(onCircle(500).slice(0, 2))).toBeNull();
    expect(estimateFire([...onCircle(500), CENTER])).toBeNull();
  });

  it("finds the circle through three marks on the fire's edge", () => {
    const estimate = estimateFire(onCircle(500));
    expect(estimate).not.toBeNull();
    expect(haversine(estimate!.center, CENTER)).toBeLessThan(1);
    expect(estimate!.radiusM).toBeCloseTo(500, 0);
    expect(estimate!.circumferenceM).toBeCloseTo(2 * Math.PI * 500, 0);
  });

  it("draws a closed ring that sits on the estimated edge", () => {
    const estimate = estimateFire(onCircle(800))!;
    expect(estimate.ring).toHaveLength(65);
    expect(estimate.ring[0]).toEqual(estimate.ring[64]);
    for (const point of estimate.ring) expect(Math.abs(haversine(point, estimate.center) - 800)).toBeLessThan(1);
  });

  it("does not work with marks in a line", () => {
    const line = [0, 1, 2].map((i) => ({ lat: CENTER.lat + i / 1000, lng: CENTER.lng + i / 1000 }));
    expect(estimateFire(line)).toBeNull();
    expect(estimateFire([CENTER, CENTER, CENTER])).toBeNull();
  });

  it("is the same circle whichever order the marks were placed in", () => {
    const [a, b, c] = onCircle(300);
    const first = estimateFire([a, b, c])!;
    const second = estimateFire([c, a, b])!;
    expect(haversine(first.center, second.center)).toBeLessThan(0.01);
    expect(first.radiusM).toBeCloseTo(second.radiusM, 3);
  });

  it("formats distances for people", () => {
    expect(formatDistance(412.6)).toBe("413 m");
    expect(formatDistance(1500)).toBe("1.50 km");
  });
});
