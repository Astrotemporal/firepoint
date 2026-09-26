import type { CSSProperties } from "react";

/** Shared flame artwork: rendered by React in the toolbar and as an HTML string inside Leaflet markers. */
const OUTER = "M12 1.5c.7 3.4-1 5.3-2.7 7.2C7.6 10.6 6 12.6 6 15.5 6 19.1 8.7 22.5 12 22.5s6-3.4 6-7c0-2.6-1.1-4.4-2.4-5.9-.3 1.5-1 2.6-2.1 3.1.5-4.1-.2-7.9-1.5-11.2z";
const INNER = "M12 22.5c-1.9 0-3.4-1.6-3.4-3.6 0-1.7.9-2.8 2-3.8.4 1.1 1 1.7 1.8 2-.1-1.6.3-3.1 1.2-4.2.9 1.4 1.8 3.1 1.8 5.8 0 2.2-1.5 3.8-3.4 3.8z";

export function Flame({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={OUTER} fill="#f3875e" />
      <path d={INNER} fill="#ffd27a" />
    </svg>
  );
}

export const FLAME_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${OUTER}" fill="#f3875e"/><path d="${INNER}" fill="#ffd27a"/></svg>`;
