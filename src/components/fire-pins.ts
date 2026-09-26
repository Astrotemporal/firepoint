import { DotLottie } from "@lottiefiles/dotlottie-web";
import { Marker, Popup, type Map as MapboxMap } from "mapbox-gl";

export type PinHandlers = {
  onMove: (id: string, lat: number, lng: number) => void;
  onRemove: (id: string) => void;
};

export type PinView = { marker: Marker; fire: DotLottie; title: HTMLElement; coords: HTMLElement; pin: HTMLElement };

/** A draggable fire mark. Listeners are attached once, so they read the latest callbacks through `handlers`. */
export function createPin(id: string, map: MapboxMap, handlers: { current: PinHandlers }): PinView {
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
  note.textContent = "Private to this device. Not a report. Routes avoid it.";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove mark";
  remove.addEventListener("click", () => handlers.current.onRemove(id));
  content.append(title, coords, note, remove);

  const popup = new Popup({ offset: 64, maxWidth: "240px", focusAfterOpen: true }).setDOMContent(content);
  const marker = new Marker({ element: pin, anchor: "bottom", draggable: true }).setLngLat(map.getCenter()).setPopup(popup).addTo(map);
  marker.on("dragend", () => {
    const { lat, lng } = marker.getLngLat();
    handlers.current.onMove(id, lat, lng);
  });
  return { marker, fire, title, coords, pin };
}

export function removePin({ fire, marker }: PinView) {
  marker.remove();
  // Destroying mid-load aborts the fetch and logs an error (every dev mount, via StrictMode).
  if (fire.isLoaded) { fire.destroy(); return; }
  const destroy = () => fire.destroy();
  fire.addEventListener("load", destroy);
  fire.addEventListener("loadError", destroy);
}
