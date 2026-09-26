"use client";

import { createContext, useContext, type ReactNode } from "react";
import { markLabel } from "@/evacuation/marks";
import type { Hazard } from "@/evacuation/types";
import { mapText, type MapText } from "@/i18n/map";
import type { Locale } from "@/i18n/locales";

const MapTextContext = createContext<MapText>(mapText("en"));

/** Supplies the map screen's text in the language chosen with the EN/ES/AM select. */
export function MapTextProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <MapTextContext.Provider value={mapText(locale)}>{children}</MapTextContext.Provider>;
}

/** The current map text; English outside a provider (tests, isolated renders). */
export function useMapText(): MapText {
  return useContext(MapTextContext);
}

/** A hazard's display name: this person's own fire marks are translated; feed labels stay as published. */
export function hazardName(hazard: Hazard, t: MapText): string {
  if (!hazard.userMark) return hazard.label;
  const index = Number(/(\d+)$/.exec(hazard.label)?.[1]);
  return Number.isInteger(index) && hazard.label === markLabel(index - 1) ? t.fireMark(index) : hazard.label;
}
