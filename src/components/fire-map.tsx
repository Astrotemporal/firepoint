"use client";

import "leaflet/dist/leaflet.css";
import L, { type Map as LeafletMap } from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";
import type { FireMark } from "@/domain/fire-marks";
import { FLAME_SVG } from "./flame";

// Glendale, CA. A display camera only, never a coverage or zone boundary.
const GLENDALE: [number, number] = [34.165, -118.255];

// Keeps opened popups clear of the floating toolbar over the map.
const POPUP_CLEARANCE: [number, number] = [16, 120];

const fireIcon = L.divIcon({
  className: "fire-pin",
  html: `<span class="fire-pin-badge">${FLAME_SVG}</span>`,
  iconSize: [42, 52],
  iconAnchor: [21, 50],
  popupAnchor: [0, -46],
});

type FireMapProps = {
  marks: FireMark[];
  onReady: (map: LeafletMap | null) => void;
  onMove: (id: string, lat: number, lng: number) => void;
  onRemove: (id: string) => void;
};

export function FireMap({ marks, onReady, onMove, onRemove }: FireMapProps) {
  return (
    <MapContainer center={GLENDALE} zoom={13} zoomControl={false} scrollWheelZoom={false} className="fire-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ZoomControl position="bottomright" />
      <MapBridge onReady={onReady} />
      {marks.map((mark, index) => (
        <Marker
          key={mark.id}
          position={[mark.lat, mark.lng]}
          icon={fireIcon}
          draggable
          title={`Your fire mark ${index + 1}. Drag to move, press Enter for options.`}
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = (event.target as L.Marker).getLatLng();
              onMove(mark.id, lat, lng);
            },
          }}
        >
          <Popup autoPanPaddingTopLeft={POPUP_CLEARANCE}>
            <div className="fire-popup">
              <strong>Your mark {index + 1}</strong>
              <span>{mark.lat.toFixed(4)}, {mark.lng.toFixed(4)}</span>
              <small>Private to this device. Not a report.</small>
              <button type="button" onClick={() => onRemove(mark.id)}>Remove mark</button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

/** Hands the map instance to the page and only captures the scroll wheel once someone engages the map. */
function MapBridge({ onReady }: { onReady: FireMapProps["onReady"] }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    const engage = () => map.scrollWheelZoom.enable();
    const release = () => map.scrollWheelZoom.disable();
    map.on("click focus", engage);
    map.on("blur mouseout", release);
    return () => {
      map.off("click focus", engage);
      map.off("blur mouseout", release);
      onReady(null);
    };
  }, [map, onReady]);
  return null;
}
