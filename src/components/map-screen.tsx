"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { MARKS_KEY, MAX_MARKS, addMark, createMark, moveMark, parseMarks, type FireMark } from "@/domain/fire-marks";
import { Flame } from "./flame";
import type { MapHandle } from "./fire-map";

// Mapbox GL touches `window` and WebGL on import, so the map only ever renders in the browser.
const FireMap = dynamic(() => import("./fire-map").then((mod) => mod.FireMap), {
  ssr: false,
  loading: () => <div className="map-loading" role="status">Loading map…</div>,
});

type Drag = { startX: number; startY: number; moved: boolean };

export function MapScreen() {
  const [marks, setMarks] = useState<FireMark[]>([]);
  const [ready, setReady] = useState(false);
  const [canStore, setCanStore] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef(false);

  useEffect(() => {
    let active = true;
    // Read device state after hydration, so server HTML and first client render match.
    queueMicrotask(() => {
      if (!active) return;
      try { setMarks(parseMarks(localStorage.getItem(MARKS_KEY))); }
      catch { setCanStore(false); }
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  const onReady = useCallback((map: MapHandle | null) => { mapRef.current = map; }, []);

  function save(next: FireMark[]) {
    setMarks(next);
    try {
      if (next.length) localStorage.setItem(MARKS_KEY, JSON.stringify(next));
      else localStorage.removeItem(MARKS_KEY);
      setCanStore(true);
    } catch { setCanStore(false); }
  }

  function place(lat: number, lng: number) {
    save(addMark(marks, createMark(lat, lng)));
    setHint(marks.length >= MAX_MARKS ? `Placed. Only the newest ${MAX_MARKS} marks are kept.` : "Placed. Drag the mark to adjust it, or select it to remove.");
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, moved: false };
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;
    current.moved = true;
    setGhost({ x: event.clientX, y: event.clientY });
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    drag.current = null;
    setGhost(null);
    if (!current?.moved) return;
    skipClick.current = true;
    const map = mapRef.current;
    if (!map) return;
    const rect = map.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setHint("Drop the fire inside the map to place it.");
      return;
    }
    const { lat, lng } = map.pointToLatLng(x, y);
    place(lat, lng);
  }

  function onPointerCancel() {
    drag.current = null;
    setGhost(null);
  }

  // Click or keyboard activation drops the fire at the centre of the current view.
  function onClick() {
    if (skipClick.current) { skipClick.current = false; return; }
    const map = mapRef.current;
    if (!map) return;
    const { lat, lng } = map.center();
    place(lat, lng);
  }

  return (
    <main className="map-screen">
      <h1 className="sr-only">Firepoint map</h1>
      <FireMap marks={marks} onReady={onReady} onMove={(id, lat, lng) => save(moveMark(marks, id, lat, lng))} onRemove={(id) => { save(marks.filter((mark) => mark.id !== id)); setHint("Mark removed."); }} />
      <div className="map-panel">
        <button
          type="button"
          className={`fire-token${ghost ? " is-dragging" : ""}`}
          disabled={!ready}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={onClick}
          aria-label="Add a fire mark. Drag onto the map, or press to place it at the map centre."
        >
          <Flame className="fire-token-flame" />
        </button>
        <div className="map-panel-copy">
          <strong>Drag the fire onto the map</strong>
          <span aria-live="polite">{hint ?? (ready ? `${marks.length} ${marks.length === 1 ? "mark" : "marks"} on this device` : "Local to this device")}</span>
        </div>
        {marks.length > 0 && <button type="button" className="map-clear" onClick={() => { save([]); setHint("All marks cleared."); }}>Clear all</button>}
      </div>
      <Link className="map-brand" href="/prepare" aria-label="Firepoint: official sources and prep list">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span>Official sources &amp; prep <span aria-hidden="true">↗</span></span>
      </Link>
      <p className="map-note"><span aria-hidden="true">!</span> Your marks are private and are not reports. This map does not show live fires, evacuation zones, or hazards. To report a fire, call 911.</p>
      {!canStore && <p className="map-storage-warning" role="status">Browser storage is unavailable. Marks may be lost when you leave this page.</p>}
      {ghost && <Flame className="fire-ghost" style={{ left: ghost.x, top: ghost.y }} />}
    </main>
  );
}
