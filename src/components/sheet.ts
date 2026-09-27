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

export type HandleGesture =
  | { kind: "tap" }
  /** A drag released at `height` px moving at `velocity` px/ms (positive when moving up). */
  | { kind: "drag"; height: number; velocity: number }
  | { kind: "key"; key: "ArrowUp" | "ArrowDown" };

export type HandleResult = {
  snap: Snap;
  /** The person deliberately slid the sheet all the way down; the drawer treats this as closing. */
  closes: boolean;
};

/**
 * Where a gesture on the handle takes the sheet, and whether it counts as closing the drawer (on phones, closing
 * clears the escape route and brings the Escape button back). Only a slide down (drag or ArrowDown) closes. A tap
 * only moves the sheet: the drawer's content is usually shorter than half the screen, so "half" and "full"
 * coincide and the first tap on the handle would otherwise land on "peek" and discard the route just requested.
 */
export function handleGesture(snap: Snap, gesture: HandleGesture, heights: SnapHeights): HandleResult {
  switch (gesture.kind) {
    case "tap":
      return { snap: cycleSnap(snap, heights), closes: false };
    case "drag": {
      const next = settleSnap(gesture.height, gesture.velocity, heights);
      return { snap: next, closes: next === "peek" };
    }
    case "key": {
      if (gesture.key === "ArrowUp") return { snap: snap === "peek" ? "half" : "full", closes: false };
      const next: Snap = snap === "full" ? "half" : "peek";
      return { snap: next, closes: next === "peek" };
    }
  }
}

/** The lowest snap with the same height, so a short sheet never reports "full" at its half height. */
function lowest(snap: Snap, heights: SnapHeights): Snap {
  return ORDER.find((candidate) => heights[candidate] === heights[snap]) ?? snap;
}
