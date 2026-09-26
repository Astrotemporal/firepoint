"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { AttributionControl, LngLatBounds, Map as MapboxMap, Marker, NavigationControl, Popup, type GeoJSONSource } from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import type { FireMark } from "@/domain/fire-marks";
import { GLENDALE_CITY_HALL } from "@/evacuation/data/glendale";
import type { LocationFix } from "@/evacuation/location";
import { markLabel } from "@/evacuation/marks";
import type { RoutePlan } from "@/evacuation/route-planner";
import {
  DESTINATION_HAZARD_BUFFER_METERS, destinationPoint, escapeHeading, isShelterAvailable, pointInHazard,
} from "@/evacuation/routing";
import type { Hazard, LatLng, SafeZone, Shelter } from "@/evacuation/types";
import { MAPBOX_STYLES, MAPBOX_TOKEN } from "@/lib/mapbox";
import { createPin, removePin, type PinHandlers, type PinView } from "./fire-pins";

/** What the screen needs from the map (dropping a fire mark), kept independent of the map library. */
export type MapHandle = {
  container: HTMLElement;
  pointToLatLng: (x: number, y: number) => LatLng;
  center: () => LatLng;
};

type EvacuationMapProps = {
  /** Follows the site theme (dark-v11 basemap when true). */
  dark: boolean;
  origin: LocationFix | null;
  hazards: readonly Hazard[];
  shelters: readonly Shelter[];
  zones: readonly SafeZone[];
  plan: RoutePlan<LocationFix> | null;
  /** Each new value re-centers the camera on `origin` (new start location, or the locate button). */
  centerKey: string | null;
  /** Each new value fits the camera to the current routes (first plan for a start location). */
  fitKey: string | null;
  /** Fire marks placed on this device, drawn as draggable animated fires. */
  marks: readonly FireMark[];
  onReady: (map: MapHandle | null) => void;
  onMoveMark: (id: string, lat: number, lng: number) => void;
  onRemoveMark: (id: string) => void;
};

const COLORS = { shelterRoute: "#1d4ed8", escapeRoute: "#c2410c", hazard: "#b91c1c", you: "#007aff" };
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const toLngLat = (point: LatLng): [number, number] => [point.lng, point.lat];

function circle(center: LatLng, radiusMeters: number, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature {
  const ring = Array.from({ length: 65 }, (_, index) => toLngLat(destinationPoint(center, (index % 64) * 5.625, radiusMeters)));
  return { type: "Feature", properties, geometry: { type: "Polygon", coordinates: [ring] } };
}

function line(path: readonly LatLng[], kind: string): GeoJSON.Feature {
  return { type: "Feature", properties: { kind }, geometry: { type: "LineString", coordinates: path.map(toLngLat) } };
}

/** Popup content built from text nodes, so data never becomes markup. */
function popupContent(lines: string[]): HTMLElement {
  const box = document.createElement("div");
  box.className = "ev-popup";
  lines.filter(Boolean).forEach((text, index) => {
    const element = document.createElement(index === 0 ? "strong" : "div");
    element.textContent = text;
    box.append(element);
  });
  return box;
}

function pinElement(className: string, glyph: string, label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `ev-pin ${className}`;
  element.setAttribute("aria-label", label);
  element.innerHTML = `<span class="ev-pin-body" aria-hidden="true"><span class="ev-pin-glyph">${glyph}</span></span>`;
  return element;
}

function addLayers(map: MapboxMap): void {
  for (const id of ["hazards", "accuracy", "routes"]) map.addSource(id, { type: "geojson", data: EMPTY });
  // A person's own fire marks are shaded lighter than hazards from the feed.
  map.addLayer({ id: "hazards-fill", type: "fill", source: "hazards", paint: { "fill-color": "#ef4444", "fill-opacity": ["case", ["get", "mark"], 0.16, 0.28] } });
  map.addLayer({ id: "hazards-line", type: "line", source: "hazards", paint: { "line-color": COLORS.hazard, "line-width": 2 } });
  map.addLayer({ id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": COLORS.you, "fill-opacity": 0.12 } });
  map.addLayer({ id: "accuracy-line", type: "line", source: "accuracy", paint: { "line-color": COLORS.you, "line-opacity": 0.4, "line-width": 1 } });
  const lineLayout = { "line-join": "round", "line-cap": "round" } as const;
  map.addLayer({
    id: "routes-casing", type: "line", source: "routes", layout: lineLayout,
    filter: ["in", ["get", "kind"], ["literal", ["shelter", "escape"]]],
    paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "route-shelter", type: "line", source: "routes", layout: lineLayout, filter: ["==", ["get", "kind"], "shelter"],
    paint: { "line-color": COLORS.shelterRoute, "line-width": 6 },
  });
  // Escape drawn after the shelter route so it sits on top: it is the priority near a hazard.
  map.addLayer({
    id: "route-escape", type: "line", source: "routes", layout: { "line-join": "round", "line-cap": "butt" },
    filter: ["==", ["get", "kind"], "escape"],
    paint: { "line-color": COLORS.escapeRoute, "line-width": 6, "line-dasharray": [2, 1.4] },
  });
  map.addLayer({
    id: "route-guides", type: "line", source: "routes", layout: lineLayout,
    filter: ["in", ["get", "kind"], ["literal", ["shelter-guide", "escape-guide"]]],
    paint: {
      "line-color": ["match", ["get", "kind"], "shelter-guide", COLORS.shelterRoute, COLORS.escapeRoute],
      "line-width": 3, "line-dasharray": [0.3, 2],
    },
  });
  // Drawn last, over the routes. A plain label instead of a popup, so the demo fire is never mistaken for a real one.
  map.addLayer({
    id: "hazards-label", type: "symbol", source: "hazards", filter: ["all", ["get", "simulated"], ["!", ["get", "mark"]]],
    layout: { "text-field": "Simulated fire", "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"], "text-size": 13 },
    paint: { "text-color": COLORS.hazard, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });
}

function planTargets(plan: RoutePlan | null): { shelter: Shelter | null; zone: SafeZone | null } {
  const shelterPick = plan?.shelter;
  const escapePick = plan?.escape;
  return {
    shelter: shelterPick?.kind === "route" || shelterPick?.kind === "routing-unavailable" ? shelterPick.shelter : null,
    zone: escapePick && escapePick.kind !== "no-zone" && escapePick.kind !== "not-requested" ? escapePick.zone : null,
  };
}

export function EvacuationMap(props: EvacuationMapProps) {
  if (!MAPBOX_TOKEN) {
    return <MapNotice text="Map unavailable: no Mapbox token is configured. Routes below still work as straight-line directions." />;
  }
  return <MapboxView {...props} />;
}

function MapNotice({ text }: { text: string }) {
  return <div className="ev-map ev-map-notice" role="status"><p>{text}</p></div>;
}

function MapboxView({
  dark, origin, hazards, shelters, zones, plan, centerKey, fitKey, marks, onReady, onMoveMark, onRemoveMark,
}: EvacuationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const pinsRef = useRef(new Map<string, PinView>());
  const pinHandlers = useRef<PinHandlers>({ onMove: onMoveMark, onRemove: onRemoveMark });
  useEffect(() => { pinHandlers.current = { onMove: onMoveMark, onRemove: onRemoveMark }; });
  const popupRef = useRef<Popup | null>(null);
  const youRef = useRef<Marker | null>(null);
  const cameraRef = useRef<{ center: string | null; fit: string | null }>({ center: null, fit: null });
  // Increments each time a style finishes loading (first load and every theme switch); layer effects wait for it.
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const style = dark ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light;
  const styleRef = useRef(style);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MapboxMap;
    let everLoaded = false;
    try {
      map = new MapboxMap({
        container,
        accessToken: MAPBOX_TOKEN,
        style: styleRef.current,
        center: toLngLat(GLENDALE_CITY_HALL),
        zoom: 12,
        attributionControl: false,
        logoPosition: "bottom-left",
      });
    } catch {
      queueMicrotask(() => setFailed(true)); // e.g. no WebGL
      return;
    }
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    // A new style drops our sources and layers, so they are rebuilt (and refilled by the effects) after each one.
    map.on("style.load", () => {
      everLoaded = true;
      addLayers(map);
      setLoaded((count) => count + 1);
    });
    map.on("error", () => { if (!everLoaded) setFailed(true); });
    mapRef.current = map;
    onReady({ container, pointToLatLng: (x, y) => map.unproject([x, y]), center: () => map.getCenter() });
    const pins = pinsRef.current;
    const camera = cameraRef.current;
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container);
    return () => {
      onReady(null);
      resize.disconnect();
      pins.forEach(removePin);
      pins.clear();
      map.remove();
      mapRef.current = null;
      youRef.current = null;
      popupRef.current = null;
      camera.center = null;
      camera.fit = null;
    };
  }, [onReady]);

  // Swap the basemap in place; a full reload (no diff) so "style.load" fires and the layers come back.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === style) return;
    styleRef.current = style;
    // Cast: the typings mark the font options required, but Mapbox fills them from the map when omitted.
    map.setStyle(style, { diff: false } as Parameters<MapboxMap["setStyle"]>[1]);
  }, [style]);

  useEffect(() => {
    const source = mapRef.current?.getSource<GeoJSONSource>("hazards");
    if (!loaded || !source) return;
    source.setData({
      type: "FeatureCollection",
      features: hazards.map((hazard) => circle(hazard.center, hazard.radiusMeters, {
        simulated: hazard.simulated, mark: Boolean(hazard.userMark),
      })),
    });
  }, [hazards, loaded]);

  // Mapbox markers live outside React, so sync them with the stored marks by id.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const views = pinsRef.current;
    const live = new Set(marks.map((mark) => mark.id));
    views.forEach((view, id) => {
      if (!live.has(id)) { removePin(view); views.delete(id); }
    });
    marks.forEach((mark, index) => {
      const view = views.get(mark.id) ?? createPin(mark.id, map, pinHandlers);
      views.set(mark.id, view);
      view.marker.setLngLat([mark.lng, mark.lat]);
      view.title.textContent = markLabel(index);
      view.pin.setAttribute("aria-label", `${markLabel(index)}. Drag to move, press Enter for options.`);
    });
  }, [marks]);

  const targets = planTargets(plan);
  const shelterTargetId = targets.shelter?.id ?? null;
  const zoneTargetId = targets.zone?.id ?? null;

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const show = (at: LatLng, lines: string[]) => {
      popupRef.current?.remove();
      popupRef.current = new Popup({ offset: 30, maxWidth: "260px" }).setLngLat(toLngLat(at)).setDOMContent(popupContent(lines)).addTo(map);
    };
    const markers = [
      ...shelters.map((shelter) => {
        const open = isShelterAvailable(shelter);
        const nearHazard = hazards.some((hazard) => pointInHazard(shelter, hazard, DESTINATION_HAZARD_BUFFER_METERS));
        const element = pinElement(
          `${open ? "ev-pin-open" : "ev-pin-closed"}${shelter.id === shelterTargetId ? " ev-pin-chosen" : ""}`,
          "⌂", `Shelter: ${shelter.name} (${open ? "open" : shelter.status})`,
        );
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          show(shelter, [shelter.name, shelter.address, `Status: ${shelter.status}${shelter.verified ? "" : " (unverified)"}`,
            nearHazard ? "Within 1 km of a hazard: not used for routing." : ""]);
        });
        return new Marker({ element, anchor: "bottom" }).setLngLat(toLngLat(shelter));
      }),
      ...zones.map((zone) => {
        const element = pinElement(`ev-pin-zone${zone.id === zoneTargetId ? " ev-pin-chosen" : ""}`, "➜", `Evacuation point: ${zone.name}`);
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          show(zone, [zone.name, zone.description, "General evacuation point, not a shelter."]);
        });
        return new Marker({ element, anchor: "bottom" }).setLngLat(toLngLat(zone));
      }),
    ];
    markers.forEach((marker) => marker.addTo(map));
    return () => markers.forEach((marker) => marker.remove());
  }, [shelters, zones, hazards, shelterTargetId, zoneTargetId, loaded]);

  useEffect(() => {
    const source = mapRef.current?.getSource<GeoJSONSource>("routes");
    if (!loaded || !source) return;
    const features: GeoJSON.Feature[] = [];
    if (plan) {
      const { shelter, escape } = plan;
      if (shelter.kind === "route") features.push(line(shelter.route.path, "shelter"));
      else if (shelter.kind === "routing-unavailable" && origin) features.push(line([origin, shelter.shelter], "shelter-guide"));
      if (escape.kind === "route") features.push(line(escape.route.path, "escape"));
      else if (escape.kind !== "no-zone" && escape.kind !== "not-requested" && origin) {
        // Same rule as the route bar: never draw a guide line across the hazard.
        const heading = escapeHeading(origin, escape.zone, hazards);
        const end = heading.toward === "target" ? escape.zone : destinationPoint(origin, heading.bearing, 1_500);
        features.push(line([origin, end], "escape-guide"));
      }
    }
    source.setData({ type: "FeatureCollection", features });
  }, [plan, origin, hazards, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const accuracy = map.getSource<GeoJSONSource>("accuracy");
    if (!origin) {
      youRef.current?.remove();
      youRef.current = null;
      accuracy?.setData(EMPTY);
      return;
    }
    const gps = origin.source === "gps";
    accuracy?.setData(gps && origin.accuracyMeters
      ? { type: "FeatureCollection", features: [circle(origin, origin.accuracyMeters)] }
      : EMPTY);
    const className = gps ? "ev-you" : "ev-start";
    if (!youRef.current || !youRef.current.getElement().classList.contains(className)) {
      youRef.current?.remove();
      const element = document.createElement("div");
      element.className = className;
      element.setAttribute("role", "img");
      youRef.current = new Marker({ element, anchor: "center" }).setLngLat(toLngLat(origin)).addTo(map);
    }
    youRef.current.getElement().setAttribute("aria-label", gps ? "Your location" : `Routes start here: ${origin.label ?? "chosen location"}`);
    youRef.current.setLngLat(toLngLat(origin));
  }, [origin, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    const camera = cameraRef.current;
    if (!loaded || !map || !origin || !centerKey || camera.center === centerKey) return;
    camera.center = centerKey;
    map.easeTo({ center: toLngLat(origin), zoom: Math.max(map.getZoom(), 15), duration: 800 });
  }, [centerKey, origin, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    const camera = cameraRef.current;
    if (!loaded || !map || !origin || !plan || !fitKey || camera.fit === fitKey) return;
    camera.fit = fitKey;
    const bounds = new LngLatBounds(toLngLat(origin), toLngLat(origin));
    if (plan.shelter.kind === "route") plan.shelter.route.path.forEach((point) => bounds.extend(toLngLat(point)));
    if (plan.escape.kind === "route") plan.escape.route.path.forEach((point) => bounds.extend(toLngLat(point)));
    const { shelter, zone } = planTargets(plan);
    if (shelter) bounds.extend(toLngLat(shelter));
    if (zone) bounds.extend(toLngLat(zone));
    map.fitBounds(bounds, { padding: fitPadding(map.getContainer()), maxZoom: 16, duration: 900 });
  }, [fitKey, plan, origin, loaded]);

  return (
    <>
      <div
        ref={containerRef}
        className="ev-map"
        role="region"
        aria-label="Map of your location, routes, hazards, and shelters. The same information is listed below the map."
      />
      {failed && <MapNotice text="The map couldn’t load. Check your connection; routes below still work." />}
    </>
  );
}

/** Keep fitted routes clear of the directions drawer: the side card on wide screens, the raised sheet on phones. */
function fitPadding(container: HTMLElement) {
  if (window.matchMedia("(min-width: 760px)").matches) return { top: 48, bottom: 48, left: 440, right: 80 };
  const shell = container.closest<HTMLElement>(".ev-shell");
  const px = (name: string) => (shell ? parseFloat(getComputedStyle(shell).getPropertyValue(name)) || 0 : 0);
  // The map already ends at the peek, so only the part of the sheet above it covers routes.
  const covered = Math.max(0, px("--ev-sheet-h") - px("--ev-peek"));
  const bottom = Math.min(container.clientHeight * 0.6, covered + 32);
  return { top: 150, bottom: Math.max(48, bottom), left: 32, right: 48 };
}
