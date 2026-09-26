"use client";

import { useEffect, useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

const MIN_VISIBLE_MS = 900;
const FADE_MS = 400;

// Rendered on the server so it covers first paint. A CSS fallback in globals.css
// hides it after a few seconds even if JavaScript never runs.
export function Preloader() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "gone">("visible");

  useEffect(() => {
    const started = performance.now();
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const leave = () => {
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - started));
      fadeTimer = setTimeout(() => {
        setPhase("leaving");
        hideTimer = setTimeout(() => setPhase("gone"), FADE_MS);
      }, wait);
    };

    if (document.readyState === "complete") leave();
    else window.addEventListener("load", leave, { once: true });

    return () => {
      window.removeEventListener("load", leave);
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div className={`preloader${phase === "leaving" ? " preloader-leaving" : ""}`} role="status" aria-label="Loading Firepoint">
      <div className="preloader-fire" aria-hidden="true">
        <DotLottieReact src="/animations/fire.lottie" loop autoplay />
      </div>
      <p className="preloader-brand">Firepoint<span>.</span></p>
    </div>
  );
}
