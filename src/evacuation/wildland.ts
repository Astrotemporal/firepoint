import type { LatLng } from "./types";

/*
 * Mapped high-hazard wildland (CAL FIRE Fire Hazard Severity Zones, High and Very High). The escape router
 * uses it as a landscape weight: fire runs fastest through brush and up canyons, so routes that leave the
 * hills sooner are preferred and escape points inside the hills are skipped. It is a dated regulatory map,
 * never live fire data, and "not wildland" does not mean safe.
 */

export type WildlandSeverity = "very-high" | "high";

type Ring = readonly (readonly [number, number])[];

export type WildlandZone = {
  severity: WildlandSeverity;
  /** [longitude, latitude] rings, open; ring 0 is the outline, the rest are holes. */
  rings: readonly Ring[];
};

export type WildlandIndex = {
  /** The most severe mapped zone at this point, or null outside High/Very High (or outside the map's coverage). */
  severityAt(point: LatLng): WildlandSeverity | null;
};

type Box = { west: number; south: number; east: number; north: number };

function boundingBox(ring: Ring): Box {
  const box = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  for (const [lng, lat] of ring) {
    box.west = Math.min(box.west, lng);
    box.east = Math.max(box.east, lng);
    box.south = Math.min(box.south, lat);
    box.north = Math.max(box.north, lat);
  }
  return box;
}

/** Even-odd ray cast; treats the ring as closed. */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if ((y1 > lat) !== (y2 > lat) && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

export function createWildlandIndex(zones: readonly WildlandZone[]): WildlandIndex {
  // Very High first, so the first hit is the most severe.
  const indexed = [...zones]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "very-high" ? -1 : 1))
    .map((zone) => ({ ...zone, box: boundingBox(zone.rings[0]) }));
  return {
    severityAt({ lat, lng }) {
      for (const { severity, rings, box } of indexed) {
        if (lng < box.west || lng > box.east || lat < box.south || lat > box.north) continue;
        if (inRing(lng, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lng, lat, hole))) return severity;
      }
      return null;
    },
  };
}
