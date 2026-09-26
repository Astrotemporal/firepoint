/*
 * Visual policy for PRIVATE marks: the pins, the dashed 500 m halo, its label and legend.
 *
 * Everything a person places on their own device is drawn in one neutral grey, in light and dark
 * mode alike. Nothing changes that colour: not how many marks exist, not where they overlap, not
 * the time of day. Warm or red fire colours are reserved for data that does not exist here yet
 * (a moderated, multi-user, unverified activity cell would be a separate contract; see PR #28).
 * A grey sketch is easier to read as "my note" and harder to mistake for a fire boundary or zone.
 */

export type MapTheme = "light" | "dark";

export type PrivateMarkPaint = {
  /** Halo outline, ring label text and legend swatch/emphasis. */
  stroke: string;
  /** Faint area tint inside the halo. */
  fill: string;
  /** Behind the ring label, for contrast against tiles. */
  labelHalo: string;
};

/** One tone per theme. No count, threshold or status field exists on purpose. */
export const PRIVATE_MARK_STYLE = {
  tone: "neutral-grey",
  paint: {
    light: { stroke: "#5b6470", fill: "#6b7280", labelHalo: "#ffffff" },
    dark: { stroke: "#a3acb8", fill: "#9ca3af", labelHalo: "#17211f" },
  },
  fillOpacity: 0.07,
  strokeOpacity: 0.7,
  /** Full desaturation of the flame artwork; the shape stays so the mark still reads as the tool that placed it. */
  iconGrayscale: 1,
} as const satisfies {
  tone: string; paint: Record<MapTheme, PrivateMarkPaint>; fillOpacity: number; strokeOpacity: number; iconGrayscale: 1;
};

/** Paint for a theme. Takes nothing else: colour never depends on marks, counts or data. */
export function privateMarkPaint(theme: MapTheme): PrivateMarkPaint {
  return PRIVATE_MARK_STYLE.paint[theme];
}

/** CSS `filter` that removes the flame's fire colours from a private mark icon. */
export const PRIVATE_MARK_ICON_FILTER = `grayscale(${PRIVATE_MARK_STYLE.iconGrayscale})` as const;
