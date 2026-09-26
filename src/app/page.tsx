import type { Viewport } from "next";
import { PublicMapScreen } from "@/components/public-map-screen";
import { getLocale } from "@/i18n/server";
import { unverifiedRoutingPrototypeEnabled } from "@/server/release-gate";
import "./map-screen.css";

export const viewport: Viewport = {
  themeColor: "#18312e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function Home() {
  const locale = await getLocale();
  // Developer-only routing prototype (unverified shelters, invented escape targets, Mapbox Directions,
  // automatic geolocation); see src/server/release-gate.ts. The literal NODE_ENV test lets the bundler drop
  // the import from production builds entirely, so the prototype code is not even shipped to the public page.
  if (process.env.NODE_ENV !== "production" && unverifiedRoutingPrototypeEnabled()) {
    const { MapScreen } = await import("@/components/map-screen");
    return <MapScreen locale={locale} />;
  }
  return <PublicMapScreen locale={locale} />;
}
