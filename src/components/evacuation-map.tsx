"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { AttributionControl, LngLatBounds, Map as MapboxMap, Marker, NavigationControl, Popup, type GeoJSONSource } from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import type { FireMark } from "@/domain/fire-marks";
import { GLENDALE_CITY_HALL } from "@/evacuation/data/glendale";
import type { LocationFix } from "@/evacuation/location";
import type { RoutePlan } from "@/evacuation/route-planner";
import { SAFE_DISTANCE_METERS, type EscapeMark } from "@/evacuation/escape";
import { formatMiles } from "@/evacuation/format";
import { DESTINATION_HAZARD_BUFFER_METERS, destinationPoint, isShelterAvailable, pointInHazard } from "@/evacuation/routing";
import type { Hazard, LatLng, Shelter } from "@/evacuation/types";
import { MAPBOX_STYLES, MAPBOX_TOKEN } from "@/lib/mapbox";
import { createPin, removePin, type PinHandlers, type PinView } from "./fire-pins";
import { useMapText } from "./map-text";
import shelterIcon from "./shelter-icon.png";

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
  /** Accessible name of the map region; the public screen passes one that mentions no routes or shelters. */
  ariaLabel?: string;
  /** Load-failure notice; the public screen passes one that promises no routes. */
  failedText?: string;
  /** In-app navigation: draw only this line and keep the camera on `center`, turned to `bearing`. */
  navigation?: MapNavigation | null;
};

export type MapNavigation = {
  path: readonly LatLng[];
  /** "…-guide" draws the dashed straight-line style used when there is no road route. */
  kind: "escape" | "shelter" | "escape-guide" | "shelter-guide";
  center: LatLng | null;
  bearing: number;
};

const COLORS = {
  shelterRoute: "#1d4ed8", escapeRoute: "#c2410c", hazard: "#b91c1c", you: "#007aff",
  // Warning yellow, as on evacuation-warning maps; the edge is a deeper amber so it reads on light and dark basemaps.
  dangerZone: "#facc15", dangerZoneEdge: "#eab308",
};
/** The yellow warning ring sits this far past each fire's edge: a little inside the escape router's 1-mile fire danger
 * zone (SAFE_DISTANCE_METERS), so every escape mark lands beyond it. */
const WARNING_RING_METERS = 1_200;
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

/** A shelter is marked by the house artwork itself (as fire marks are by the fire), its base on the location. */
function shelterPinElement(className: string, label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `ev-pin ev-pin-shelter ${className}`;
  element.setAttribute("aria-label", label);
  const image = document.createElement("img");
  image.className = "ev-pin-image";
  image.src = shelterIcon.src;
  image.alt = "";
  image.draggable = false;
  element.append(image);
  return element;
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
  for (const id of ["danger-zones", "hazards", "accuracy", "routes"]) map.addSource(id, { type: "geojson", data: EMPTY });
  // The warning ring around each fire: a warning-yellow wash with a dotted edge, under the fire itself.
  // The escape route always ends beyond it.
  map.addLayer({ id: "danger-zones-fill", type: "fill", source: "danger-zones", paint: { "fill-color": COLORS.dangerZone, "fill-opacity": 0.15 } });
  map.addLayer({
    id: "danger-zones-line", type: "line", source: "danger-zones", layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLORS.dangerZoneEdge, "line-width": 2.5, "line-opacity": 0.9, "line-dasharray": [0.1, 2] },
  });
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
    filter: ["==", ["get", "kind"], "shelter-guide"],
    paint: {
      "line-color": COLORS.shelterRoute,
      "line-width": 3, "line-dasharray": [0.3, 2],
    },
  });
}

function planTargets(plan: RoutePlan | null): { shelter: Shelter | null; escapeMark: EscapeMark | null } {
  const shelterPick = plan?.shelter;
  const escapePick = plan?.escape;
  return {
    shelter: shelterPick?.kind === "route" || shelterPick?.kind === "routing-unavailable" ? shelterPick.shelter : null,
    escapeMark: escapePick?.kind === "route" || escapePick?.kind === "routing-unavailable" ? escapePick.mark : null,
  };
}

export function EvacuationMap(props: EvacuationMapProps) {
  const t = useMapText();
  if (!MAPBOX_TOKEN) {
    return <MapNotice text={t.noMapToken} />;
  }
  return <MapboxView {...props} />;
}

function MapNotice({ text }: { text: string }) {
  return <div className="ev-map ev-map-notice" role="status"><p>{text}</p></div>;
}

function MapboxView({
  dark, origin, hazards, shelters, plan, centerKey, fitKey, marks, onReady, onMoveMark, onRemoveMark,
  ariaLabel, failedText, navigation = null,
}: EvacuationMapProps) {
  const t = useMapText();
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
    const map = mapRef.current;
    const source = map?.getSource<GeoJSONSource>("hazards");
    if (!loaded || !source) return;
    source.setData({
      type: "FeatureCollection",
      features: hazards.map((hazard) => circle(hazard.center, hazard.radiusMeters, { mark: Boolean(hazard.userMark) })),
    });
    map?.getSource<GeoJSONSource>("danger-zones")?.setData({
      type: "FeatureCollection",
      features: hazards.map((hazard) => circle(hazard.center, hazard.radiusMeters + WARNING_RING_METERS)),
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
      const view = views.get(mark.id) ?? createPin(mark.id, map, pinHandlers, { note: t.pinPrivate, remove: t.removeMark });
      views.set(mark.id, view);
      view.marker.setLngLat([mark.lng, mark.lat]);
      view.title.textContent = t.fireMark(index + 1);
      view.pin.setAttribute("aria-label", t.pinLabel(t.fireMark(index + 1)));
    });
  }, [marks, t]);

  const targets = planTargets(plan);
  const shelterTargetId = targets.shelter?.id ?? null;
  const escapeMark = targets.escapeMark;

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
        const element = shelterPinElement(
          `${open ? "ev-pin-open" : "ev-pin-closed"}${shelter.id === shelterTargetId ? " ev-pin-chosen" : ""}`,
          t.shelterPin(shelter.name, t.shelterStatus[open ? "open" : shelter.status]),
        );
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          show(shelter, [shelter.name, shelter.address, t.shelterStatusLine(t.shelterStatus[shelter.status], shelter.verified),
            nearHazard ? t.shelterNearHazard : ""]);
        });
        return new Marker({ element, anchor: "bottom" }).setLngLat(toLngLat(shelter));
      }),
    ];
    // The escape mark: where the escape route ends, on a road just outside the fire danger zone.
    if (escapeMark) {
      const element = pinElement("ev-pin-zone ev-pin-chosen", "➜", t.escapeMarkPin);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        show(escapeMark, [t.escapeMarkTitle, t.escapeMarkNote(formatMiles(SAFE_DISTANCE_METERS, t.units))]);
      });
      markers.push(new Marker({ element, anchor: "bottom" }).setLngLat(toLngLat(escapeMark)));
    }
    markers.forEach((marker) => marker.addTo(map));
    return () => markers.forEach((marker) => marker.remove());
  }, [shelters, hazards, shelterTargetId, escapeMark, loaded, t]);

  useEffect(() => {
    const source = mapRef.current?.getSource<GeoJSONSource>("routes");
    if (!loaded || !source) return;
    const features: GeoJSON.Feature[] = [];
    if (navigation) {
      if (navigation.path.length >= 2) features.push(line(navigation.path, navigation.kind));
    } else if (plan) {
      const { shelter, escape } = plan;
      if (shelter.kind === "route") features.push(line(shelter.route.path, "shelter"));
      else if (shelter.kind === "routing-unavailable" && origin) features.push(line([origin, shelter.shelter], "shelter-guide"));
      // Escape is only ever drawn as a road route: never a straight line across hills or freeways.
      if (escape.kind === "route") features.push(line(escape.route.path, "escape"));
    }
    source.setData({ type: "FeatureCollection", features });
  }, [plan, origin, hazards, loaded, navigation]);

  // Navigation camera: follow the position, tilted and turned to the direction of travel, like a maps app.
  const navigating = navigation !== null;
  const navCenter = navigation?.center ?? null;
  const navBearing = navigation?.bearing ?? 0;
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    if (!navigating) {
      if (map.getPitch() !== 0 || map.getBearing() !== 0) map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      return;
    }
    if (!navCenter) return;
    map.easeTo({
      center: toLngLat(navCenter), bearing: navBearing, pitch: 50, zoom: 17, duration: 900,
      padding: navigationPadding(map.getContainer()),
    });
  }, [navigating, navCenter, navBearing, loaded]);

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
    youRef.current.getElement().setAttribute("aria-label", gps ? t.yourLocation : t.routesStartHere(origin.label ?? t.chosenLocation));
    youRef.current.setLngLat(toLngLat(origin));
  }, [origin, loaded, t]);

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
    const { shelter, escapeMark: mark } = planTargets(plan);
    if (shelter) bounds.extend(toLngLat(shelter));
    if (mark) bounds.extend(toLngLat(mark));
    map.fitBounds(bounds, { padding: fitPadding(map.getContainer()), maxZoom: 16, duration: 900 });
  }, [fitKey, plan, origin, loaded]);

  return (
    <>
      <div
        ref={containerRef}
        className="ev-map"
        role="region"
        aria-label={ariaLabel ?? t.mapLabel}
      />
      {failed && <MapNotice text={failedText ?? t.mapFailed} />}
    </>
  );
}

/** While navigating, keep the position below the maneuver banner and above the trip card. */
function navigationPadding(container: HTMLElement) {
  const height = container.clientHeight;
  return { top: Math.min(160, height * 0.25), bottom: Math.min(260, height * 0.35), left: 24, right: 24 };
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
