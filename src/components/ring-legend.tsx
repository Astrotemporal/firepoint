import { RING_DASH, ringLabel, type RingVisual } from "@/domain/ring-visual";

/**
 * A one-line legend for a ring drawn on screen. The swatch uses the shared dash rhythm; the words
 * come from the ring's own kind, so a private halo is always named as a sketch, never as a zone.
 */
export function RingLegend({ ring, dashed, note }: { ring: RingVisual; dashed: boolean; note: string }) {
  return (
    <p className="ring-legend" data-ring-kind={ring.kind}>
      <svg className="ring-legend-swatch" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="8" fill="none" strokeWidth="1.5" strokeDasharray={dashed ? RING_DASH.join(" ") : undefined} />
      </svg>
      <span><strong>{ringLabel(ring)}</strong> {note}</span>
    </p>
  );
}
