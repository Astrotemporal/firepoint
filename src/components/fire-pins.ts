import { DotLottie } from "@lottiefiles/dotlottie-web";
import { Marker, Popup, type Map as MapboxMap } from "mapbox-gl";

export type PinHandlers = {
  onMove: (id: string, lat: number, lng: number) => void;
  onRemove: (id: string) => void;
};

export type PinView = { marker: Marker; fire: DotLottie; title: HTMLElement; pin: HTMLElement };

/** A draggable fire mark. Listeners are attached once, so they read the latest callbacks through `handlers`. */
export type PinText = { note: string; remove: string };
const PIN_TEXT_EN: PinText = { note: "Private to this device, not a report.", remove: "Remove mark" };

export function createPin(id: string, map: MapboxMap, handlers: { current: PinHandlers }, text: PinText = PIN_TEXT_EN): PinView {
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
  const note = document.createElement("small");
  note.textContent = text.note;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = text.remove;
  remove.addEventListener("click", () => handlers.current.onRemove(id));
  content.append(title, note, remove);

  const popup = new Popup({ offset: 64, maxWidth: "240px", focusAfterOpen: true }).setDOMContent(content);
  const marker = new Marker({ element: pin, anchor: "bottom", draggable: true }).setLngLat(map.getCenter()).setPopup(popup).addTo(map);
  marker.on("dragend", () => {
    const { lat, lng } = marker.getLngLat();
    handlers.current.onMove(id, lat, lng);
  });
  return { marker, fire, title, pin };
}

export function removePin({ fire, marker }: PinView) {
  marker.remove();
  // Destroying mid-load aborts the fetch and logs an error (every dev mount, via StrictMode).
  if (fire.isLoaded) { fire.destroy(); return; }
  const destroy = () => fire.destroy();
  fire.addEventListener("load", destroy);
  fire.addEventListener("loadError", destroy);
}
