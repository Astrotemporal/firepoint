"use client";

import { useRef, useState, type PointerEvent, type RefObject } from "react";
import type { MapHandle } from "./evacuation-map";
import { Flame } from "./flame";

type FirePanelProps = {
  /** False until stored marks are read after hydration; the fire stays disabled until then. */
  ready: boolean;
  count: number;
  hint: string | null;
  map: RefObject<MapHandle | null>;
  onPlace: (lat: number, lng: number) => void;
  onHint: (hint: string) => void;
  onClear: () => void;
};

type Drag = { startX: number; startY: number; lastX: number; lastY: number; moved: boolean };

/** Drag the fire onto the map (or press it to drop one at the map centre). */
export function FirePanel({ ready, count, hint, map, onPlace, onHint, onClear }: FirePanelProps) {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef(false);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Moves over the button still work. */ }
    drag.current = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    // The release never reached the page (e.g. let go outside the window): drop where the fire was last shown,
    // instead of leaving it stuck to the screen.
    if (event.buttons === 0) { finish(current.lastX, current.lastY, false); return; }
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;
    current.moved = true;
    current.lastX = event.clientX;
    current.lastY = event.clientY;
    setGhost({ x: event.clientX, y: event.clientY });
  }

  /** Ends a drag and, if the fire moved far enough to count, places it at the given screen point. */
  function finish(clientX: number, clientY: number, released: boolean) {
    const current = drag.current;
    drag.current = null;
    setGhost(null);
    if (!current?.moved) return;
    // A real release is followed by a click on the button; swallow it so it doesn't drop a second fire.
    if (released) skipClick.current = true;
    const handle = map.current;
    if (!handle) return;
    const rect = handle.container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      onHint("Drop the fire inside the map to place it.");
      return;
    }
    const { lat, lng } = handle.pointToLatLng(x, y);
    onPlace(lat, lng);
  }

  function onPointerCancel() {
    drag.current = null;
    setGhost(null);
  }

  // Capture can end without a pointerup reaching us; finish rather than leave the ghost behind.
  // (After a normal release the drag is already over, so this does nothing.)
  function onLostPointerCapture() {
    const current = drag.current;
    if (current) finish(current.lastX, current.lastY, false);
  }

  // Click or keyboard activation drops the fire at the centre of the current view.
  function onClick() {
    if (skipClick.current) { skipClick.current = false; return; }
    const handle = map.current;
    if (!handle) return;
    const { lat, lng } = handle.center();
    onPlace(lat, lng);
  }

  return (
    <div className="map-panel">
      <button
        type="button"
        className={`fire-token${ghost ? " is-dragging" : ""}`}
        disabled={!ready}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finish(event.clientX, event.clientY, true)}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        onClick={onClick}
        aria-label="Add a fire mark. Drag onto the map, or press to place it at the map centre."
      >
        <Flame className="fire-token-flame" />
      </button>
      <div className="map-panel-copy">
        <strong>Drag the fire onto the map</strong>
        <span aria-live="polite">{hint ?? (ready ? `${count} ${count === 1 ? "mark" : "marks"} on this device · private, not reports` : "Local to this device")}</span>
      </div>
      {count > 0 && <button type="button" className="map-clear" onClick={onClear}>Clear all</button>}
      {ghost && <Flame className="fire-ghost" style={{ left: ghost.x, top: ghost.y }} />}
    </div>
  );
}
