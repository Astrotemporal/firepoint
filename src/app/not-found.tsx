import type { Metadata } from "next";
import { Montserrat, Playfair_Display } from "next/font/google";
import Link from "next/link";
import { Flame } from "@/components/flame";
import { MissingPath } from "@/components/missing-path";
import "./not-found.css";

// Same stand-ins as /prepare for glendaleca.gov's Proxima Nova and Questa.
const sans = Montserrat({ subsets: ["latin"], variable: "--font-sans" });
const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Firepoint | Off the map",
  description: "There is no page at this address.",
};

/** The route that never arrives: it draws itself across the rings and dead-ends at the pin. */
const ROUTE = "M 40 300 C 110 240, 150 350, 210 280 S 300 170, 340 220 S 400 300, 430 250";

export default function NotFound() {
  return (
    <main lang="en" className={`not-found ${sans.variable} ${serif.variable}`}>
      <div className="nf-inner">
        <section className="nf-copy">
          <p className="nf-kicker"><span className="nf-kicker-line" />404 · Route not found</p>
          <h1>Off the <em>map.</em></h1>
          <p className="nf-lede">
            There&apos;s no page at this address. The map, your fire marks, and the Ready, Set, Go guide are all still where you left them.
          </p>
          <MissingPath />
          <div className="nf-actions">
            <Link className="nf-button" href="/">Back to the map <span aria-hidden="true">→</span></Link>
            <Link className="nf-link" href="/prepare">Open the guide</Link>
          </div>
          <p className="nf-foot"><span className="nf-spark" aria-hidden="true">✦</span> In an emergency, call 911. Firepoint is not an alert system.</p>
        </section>

        <div className="nf-scene" aria-hidden="true">
          <span className="nf-ring nf-ring-1" />
          <span className="nf-ring nf-ring-2" />
          <span className="nf-ring nf-ring-3" />
          <span className="nf-ping" />
          <svg className="nf-map" viewBox="0 0 480 480" fill="none">
            <defs>
              <pattern id="nf-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" stroke="rgba(255,255,255,.09)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="480" height="480" fill="url(#nf-grid)" />
            <path className="nf-route-shadow" d={ROUTE} />
            <path className="nf-route" d={ROUTE} pathLength="1" />
            <circle className="nf-start" cx="40" cy="300" r="7" />
          </svg>
          <div className="nf-pin">
            <span className="nf-pin-mark">?</span>
          </div>
          <Flame className="nf-flame" />
          <p className="nf-coords">34.1425° N · 118.2551° W · ??</p>
        </div>
      </div>
    </main>
  );
}
