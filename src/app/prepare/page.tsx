import type { Metadata } from "next";
import { Montserrat, Playfair_Display } from "next/font/google";
import { WildfireGuide } from "@/components/wildfire-guide";
import "./guide.css";

// Stand-ins for glendaleca.gov's Proxima Nova and Questa, which are licensed to the City through Adobe Fonts.
const sans = Montserrat({ subsets: ["latin"], variable: "--font-sans" });
const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Firepoint | Ready, Set, Go",
  description: "A wildfire guide for Glendale, adapted from the LA County Fire Department's Ready! Set! Go! plan.",
};

export default function Prepare() {
  return <div className={`${sans.variable} ${serif.variable}`}><WildfireGuide /></div>;
}
