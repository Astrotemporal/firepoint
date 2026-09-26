import type { Viewport } from "next";
import { MapScreen } from "@/components/map-screen";
import { getLocale } from "@/i18n/server";
import "./map-screen.css";

export const viewport: Viewport = {
  themeColor: "#18312e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function Home() {
  return <MapScreen locale={await getLocale()} />;
}
