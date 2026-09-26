/** Estimated fire extent from three marks on its edge: the one circle that passes through all three. */
const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;
const RING_STEPS = 64;

export type LatLng = { lat: number; lng: number };

export type FireEstimate = {
  center: LatLng;
  radiusM: number;
  circumferenceM: number;
  /** Closed ring around the estimate, first point repeated last, for drawing. */
  ring: LatLng[];
};

/** Null unless exactly three marks are given and they are not in a line. */
export function estimateFire(marks: readonly LatLng[]): FireEstimate | null {
  if (marks.length !== 3) return null;
  const [a, b, c] = marks;
  // Marks are a few km apart at most, so a flat local frame around their centroid is accurate to well under a metre.
  const lat0 = (a.lat + b.lat + c.lat) / 3;
  const lng0 = (a.lng + b.lng + c.lng) / 3;
  const scaleX = EARTH_RADIUS_M * DEG * Math.cos(lat0 * DEG);
  const scaleY = EARTH_RADIUS_M * DEG;
  const local = (p: LatLng) => ({ x: (p.lng - lng0) * scaleX, y: (p.lat - lat0) * scaleY });
  const geo = (x: number, y: number): LatLng => ({ lat: lat0 + y / scaleY, lng: lng0 + x / scaleX });

  const [p, q, r] = [a, b, c].map(local);
  const d = 2 * (p.x * (q.y - r.y) + q.x * (r.y - p.y) + r.x * (p.y - q.y));
  if (Math.abs(d) < 1e-6) return null;
  const pp = p.x ** 2 + p.y ** 2;
  const qq = q.x ** 2 + q.y ** 2;
  const rr = r.x ** 2 + r.y ** 2;
  const ux = (pp * (q.y - r.y) + qq * (r.y - p.y) + rr * (p.y - q.y)) / d;
  const uy = (pp * (r.x - q.x) + qq * (p.x - r.x) + rr * (q.x - p.x)) / d;
  const radiusM = Math.hypot(p.x - ux, p.y - uy);

  const ring = Array.from({ length: RING_STEPS + 1 }, (_, i) => {
    const t = (i / RING_STEPS) * 2 * Math.PI;
    return geo(ux + radiusM * Math.cos(t), uy + radiusM * Math.sin(t));
  });
  return { center: geo(ux, uy), radiusM, circumferenceM: 2 * Math.PI * radiusM, ring };
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
}
