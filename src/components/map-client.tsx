"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { GLENDALE_VIEW, OPENFREEMAP_STYLE_URL } from "@/lib/map-style";

/** Loaded only after the visitor asks for the externally hosted street map. */
export default function MapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let map: MapLibreMap | undefined;
    import("maplibre-gl").then(({ Map, setWorkerUrl }) => {
      if (disposed || !containerRef.current) return;
      // Next/Turbopack does not rewrite MapLibre 6's internal import.meta.url worker path.
      setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      const instance = new Map({
        container: containerRef.current,
        style: OPENFREEMAP_STYLE_URL,
        center: [GLENDALE_VIEW.longitude, GLENDALE_VIEW.latitude],
        zoom: GLENDALE_VIEW.zoom,
        cooperativeGestures: true,
        // No markers, location controls, operational layers, or saved-area geometry.
      });
      map = instance;
      mapRef.current = instance;
      instance.on("error", () => setError(true));
    }).catch(() => { if (!disposed) setError(true); });
    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);
  return (
    <div>
      <div ref={containerRef} role="region" aria-label="Interactive street map centered on Glendale, California. No emergency information is shown."
        style={{ width: "100%", height: 350, border: "1px solid #d8dbd1", borderRadius: 8, overflow: "hidden" }} />
      {error && <p role="status">The street map may be unavailable. Check your connection; this map is not an emergency status source.</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }} aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}
          style={{ minWidth: 48, minHeight: 48, border: "1px solid #18312e", borderRadius: 5 }}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}
          style={{ minWidth: 48, minHeight: 48, border: "1px solid #18312e", borderRadius: 5 }}>−</button>
      </div>
    </div>
  );
}
