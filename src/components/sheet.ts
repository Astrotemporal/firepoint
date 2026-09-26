/** Bottom-sheet snap logic for the directions drawer (phones). Pure, so it can be tested without a DOM. */

export type Snap = "peek" | "half" | "full";
export type SnapHeights = Record<Snap, number>;

const ORDER: readonly Snap[] = ["peek", "half", "full"];
/** Room kept above a full sheet for the fire panel and map buttons. */
export const FULL_TOP_GAP = 110;
/** Release speed (px/ms) that counts as a flick rather than a placement. */
const FLICK = 0.4;

export function snapHeights({ peek, content, viewport }: { peek: number; content: number; viewport: number }): SnapHeights {
  const fit = (target: number) => Math.max(peek, Math.min(content, target));
  return { peek, half: fit(Math.round(viewport / 2)), full: fit(viewport - FULL_TOP_GAP) };
}

/** Where a drag released at `height` comes to rest; `velocity` is px/ms, positive when moving up. */
export function settleSnap(height: number, velocity: number, heights: SnapHeights): Snap {
  if (Math.abs(velocity) >= FLICK) {
    // A flick goes to the next height in its direction, or stops at the end.
    const ahead = velocity > 0
      ? ORDER.find((snap) => heights[snap] > height) ?? "full"
      : [...ORDER].reverse().find((snap) => heights[snap] < height) ?? "peek";
    return lowest(ahead, heights);
  }
  return ORDER.reduce((best, snap) => (Math.abs(heights[snap] - height) < Math.abs(heights[best] - height) ? snap : best));
}

/** Tapping the handle: peek → half → full → peek, skipping heights equal to the one below. */
export function cycleSnap(snap: Snap, heights: SnapHeights): Snap {
  const next = ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length];
  if (next !== "peek" && heights[next] <= heights[snap]) return "peek";
  return next;
}

/** The lowest snap with the same height, so a short sheet never reports "full" at its half height. */
function lowest(snap: Snap, heights: SnapHeights): Snap {
  return ORDER.find((candidate) => heights[candidate] === heights[snap]) ?? snap;
}
