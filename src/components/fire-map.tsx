"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import { DotLottie } from "@lottiefiles/dotlottie-web";
import { useEffect, useRef } from "react";
import type { FireMark } from "@/domain/fire-marks";

// Glendale, CA as [lng, lat]. A display camera only, never a coverage or zone boundary.
const GLENDALE: [number, number] = [-118.255, 34.165];
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const STYLES = { light: "mapbox://styles/mapbox/streets-v12", dark: "mapbox://styles/mapbox/dark-v11" };

type LatLng = { lat: number; lng: number };

/** What the page needs from the map, kept independent of the map library. */
export type MapHandle = {
  container: HTMLElement;
  pointToLatLng: (x: number, y: number) => LatLng;
  center: () => LatLng;
};

type FireMapProps = {
  dark: boolean;
  marks: FireMark[];
  onReady: (map: MapHandle | null) => void;
  onMove: (id: string, lat: number, lng: number) => void;
  onRemove: (id: string) => void;
};

type PinView = { marker: mapboxgl.Marker; fire: DotLottie; title: HTMLElement; coords: HTMLElement; pin: HTMLElement };

export function FireMap({ dark, marks, onReady, onMove, onRemove }: FireMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pins = useRef(new Map<string, PinView>());
  // Marker listeners are attached once, so they read the latest callbacks through a ref.
  const handlers = useRef({ onMove, onRemove });
  useEffect(() => { handlers.current = { onMove, onRemove }; });
  const style = dark ? STYLES.dark : STYLES.light;
  const styleRef = useRef(style);

  useEffect(() => {
    const container = containerRef.current;
    if (!TOKEN || !container) return;
    const views = pins.current;
    const map = new mapboxgl.Map({
      accessToken: TOKEN,
      container,
      style: styleRef.current,
      center: GLENDALE,
      zoom: 13,
      logoPosition: "bottom-right",
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    onReady({
      container,
      pointToLatLng: (x, y) => map.unproject([x, y]),
      center: () => map.getCenter(),
    });
    return () => {
      onReady(null);
      views.forEach(removePin);
      views.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [onReady]);

  // Swap the basemap in place; DOM markers and popups survive a style change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === style) return;
    styleRef.current = style;
    map.setStyle(style);
  }, [style]);

  // Mapbox markers live outside React, so sync them with the stored marks by id.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const views = pins.current;
    const live = new Set(marks.map((mark) => mark.id));
    views.forEach((view, id) => {
      if (!live.has(id)) { removePin(view); views.delete(id); }
    });
    marks.forEach((mark, index) => {
      const view = views.get(mark.id) ?? createPin(mark.id, map, handlers);
      views.set(mark.id, view);
      view.marker.setLngLat([mark.lng, mark.lat]);
      view.title.textContent = `Your mark ${index + 1}`;
      view.coords.textContent = `${mark.lat.toFixed(4)}, ${mark.lng.toFixed(4)}`;
      view.pin.setAttribute("aria-label", `Your fire mark ${index + 1}. Drag to move, press Enter for options.`);
    });
  }, [marks]);

  if (!TOKEN) {
    return (
      <div className="map-loading" role="status">
        <p>Map unavailable: set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code>.env.local</code>.</p>
      </div>
    );
  }
  return <div ref={containerRef} className="fire-map" />;
}

function createPin(id: string, map: mapboxgl.Map, handlers: { current: Pick<FireMapProps, "onMove" | "onRemove"> }): PinView {
  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "fire-pin";
  // The same animated fire as the preloader marks the spot; its base sits on the location.
  const canvas = document.createElement("canvas");
  canvas.className = "fire-pin-fire";
  canvas.setAttribute("aria-hidden", "true");
  pin.append(canvas);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fire = new DotLottie({ canvas, src: "/animations/fire.lottie", loop: true, autoplay: !still });

  const content = document.createElement("div");
  content.className = "fire-popup";
  const title = document.createElement("strong");
  const coords = document.createElement("span");
  const note = document.createElement("small");
  note.textContent = "Private to this device. Not a report.";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove mark";
  remove.addEventListener("click", () => handlers.current.onRemove(id));
  content.append(title, coords, note, remove);

  const popup = new mapboxgl.Popup({ offset: 64, maxWidth: "240px", focusAfterOpen: true }).setDOMContent(content);
  const marker = new mapboxgl.Marker({ element: pin, anchor: "bottom", draggable: true }).setLngLat(map.getCenter()).setPopup(popup).addTo(map);
  marker.on("dragend", () => {
    const { lat, lng } = marker.getLngLat();
    handlers.current.onMove(id, lat, lng);
  });
  return { marker, fire, title, coords, pin };
}

function removePin({ fire, marker }: PinView) {
  marker.remove();
  // Destroying mid-load aborts the fetch and logs an error (every dev mount, via StrictMode).
  if (fire.isLoaded) { fire.destroy(); return; }
  const destroy = () => fire.destroy();
  fire.addEventListener("load", destroy);
  fire.addEventListener("loadError", destroy);
}
