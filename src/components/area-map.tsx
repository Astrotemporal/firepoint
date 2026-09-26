"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Next 16 requires ssr: false inside a Client Component.
const MapClient = dynamic(() => import("./map-client"), {
  ssr: false,
  loading: () => <p role="status">Loading street map…</p>,
});

/** Optional street-map reference; no live data, zone lookup, or location tracking. */
export function AreaMap() {
  const [enabled, setEnabled] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <section aria-label="Glendale street map" style={{ maxWidth: 850, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 16px" }}>Explore a street map of Glendale.</h2>
      <p style={{ lineHeight: 1.5, margin: "0 0 12px" }}>
        For orientation only. This map does not show current incidents, hazards, evacuation orders, or official zones.
        It does not locate you or check a saved area.
      </p>
      {offline ? (
        <p role="status">Street map unavailable offline. Map tiles require an internet connection.</p>
      ) : enabled ? (
        <MapClient />
      ) : (
        <button type="button" onClick={() => setEnabled(true)} style={{ minHeight: 48, padding: "10px 18px" }}>
          Load street map (uses internet)
        </button>
      )}
      <p style={{ fontSize: 13, lineHeight: 1.5, margin: "12px 0 0" }}>
        Basemap: <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>
        {" · "}<a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a>
        {" · "}Data: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>.
        Online tiles are not saved for offline use.
      </p>
    </section>
  );
}
