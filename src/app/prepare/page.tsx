import type { Metadata } from "next";
import { Montserrat, Noto_Sans_Armenian, Noto_Serif_Armenian, Playfair_Display } from "next/font/google";
import { WildfireGuide } from "@/components/wildfire-guide";
import { guideContent } from "@/domain/guide-content";
import { getLocale } from "@/i18n/server";
import "./guide.css";

// Stand-ins for glendaleca.gov's Proxima Nova and Questa, which are licensed to the City through Adobe Fonts.
// Montserrat and Playfair have no Armenian letters, so Noto Armenian faces fill in for Armenian text.
const sans = Montserrat({ subsets: ["latin"], variable: "--font-sans" });
const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });
const armenianSans = Noto_Sans_Armenian({ subsets: ["armenian"], variable: "--font-sans-hy" });
const armenianSerif = Noto_Serif_Armenian({ subsets: ["armenian"], variable: "--font-serif-hy" });

export async function generateMetadata(): Promise<Metadata> {
  const { ui } = guideContent(await getLocale());
  return { title: ui.metaTitle, description: ui.metaDescription };
}

export default async function Prepare() {
  const locale = await getLocale();
  const fonts = [sans.variable, serif.variable, ...(locale === "hy" ? [armenianSans.variable, armenianSerif.variable] : [])];
  return <div className={fonts.join(" ")}><WildfireGuide locale={locale} /></div>;
}
