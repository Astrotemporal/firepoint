"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AreaMap } from "@/components/area-map";
import { FireReadiness } from "@/components/fire-readiness";
import { LiveSources } from "@/components/live-sources";
import { registerServiceWorker } from "@/lib/service-worker";

const AREA_KEY = "firepoint.area.v1";
const LINKS = [
  {
    index: "01",
    label: "Glendale Alerts",
    purpose: "Sign up to receive city emergency messages.",
    url: "https://www.glendaleca.gov/government/departments/fire-department/other/emergency-preparedness-response/city-wide-emergency-communications",
    domain: "City of Glendale · official page",
  },
  {
    index: "02",
    label: "Know Your Zone",
    purpose: "Open Glendale Fire’s official zone guidance and lookup.",
    url: "https://www.glendaleca.gov/government/departments/fire-department/other-links/emergency-preparedness-response/know-your-zone",
    domain: "Glendale Fire Department",
  },
  {
    index: "03",
    label: "National Weather Service",
    purpose: "Read weather alerts and forecasts from NWS Los Angeles/Oxnard.",
    url: "https://www.weather.gov/lox/",
    domain: "weather.gov · Los Angeles/Oxnard",
  },
] as const;

export function FirepointHome({ demoLiveSources = false }: { demoLiveSources?: boolean } = {}) {
  const [area, setArea] = useState(false);
  const [ready, setReady] = useState(false);
  const [canStore, setCanStore] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    // Read device state after hydration, so server HTML and first client render match.
    queueMicrotask(() => {
      if (!active) return;
      try { setArea(localStorage.getItem(AREA_KEY) === "glenoaks-canyon"); }
      catch { setCanStore(false); }
      setOffline(!navigator.onLine);
      setReady(true);
    });
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    registerServiceWorker();
    return () => {
      active = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  function saveArea() {
    const next = !area;
    setArea(next);
    try {
      if (next) localStorage.setItem(AREA_KEY, "glenoaks-canyon");
      else localStorage.removeItem(AREA_KEY);
      setCanStore(true);
    } catch { setCanStore(false); }
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Firepoint map">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>firepoint<span className="brand-period">.</span></span>
        </Link>
        <nav className="top-nav" aria-label="Sections"><Link className="top-action" href="/">Map</Link><a className="top-action" href="#official">Official sources <span aria-hidden="true">↗</span></a></nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero-inner">
            <div className="eyebrow"><span className="eyebrow-line" /> A personal readiness space · Glendale, CA</div>
            <h1 id="hero-heading">A calmer place<br />to <em>get ready.</em></h1>
            <p className="hero-copy">Keep the small things together. Find the right official sources when it matters. Make your own plan before you need it.</p>
            <div className="hero-actions">
              <a className="button button-light" href="#prepare">Start your list <span aria-hidden="true">↘</span></a>
              <a className="text-link light-link" href="#official">Find official information <span aria-hidden="true">↗</span></a>
            </div>
            <div className="hero-foot"><span className="mini-spark" aria-hidden="true">✳</span> An independent tool. Not a government service or emergency alert system.</div>
          </div>
          <div className="hero-art" aria-hidden="true"><span className="art-ring art-ring-one" /><span className="art-ring art-ring-two" /><span className="art-ring art-ring-three" /><span className="art-point">✳</span></div>
        </section>

        <div className="content-wrap">
          {offline && <p className="offline-banner" role="status">Your device appears offline. Open official sources again when connected; this app cannot show live notices offline.</p>}
          <section className="source-status" aria-labelledby="status-heading">
            <div className="section-kicker">FIRST, THE IMPORTANT PART <span> / 01</span></div>
            <div className="status-layout">
              <div className="status-intro"><h2 id="status-heading">Check with the source.</h2><p>Firepoint does not check live evacuation orders or look up your official evacuation zone. A blank screen here is not an all-clear.</p></div>
              <div className="status-list" aria-label="Information not available in Firepoint">
                <div className="status-row"><div><span className="status-icon" aria-hidden="true">!</span><strong>Live orders &amp; warnings</strong></div><span className="status-tag">NOT CHECKED</span></div>
                <div className="status-row"><div><span className="status-icon" aria-hidden="true">!</span><strong>Your evacuation zone</strong></div><span className="status-tag">NOT LOOKED UP</span></div>
                <p className="status-caption">For current decisions, follow emergency officials and their published instructions.</p>
              </div>
            </div>
            {demoLiveSources ? <LiveSources /> : <section className="live-panel" aria-label="Live source checks paused">
              <h3>Live source checks are paused</h3>
              <p>Firepoint has not completed source-rights, caching, rate-limit and monitoring checks. No live feed was checked here. Use the official agency links below for current information.</p>
            </section>}
          </section>

          <section id="official" className="official-section" aria-labelledby="official-heading">
            <div className="section-kicker">GO DIRECT <span> / 02</span></div>
            <div className="section-heading"><h2 id="official-heading">The right tabs<br /><em>to keep open.</em></h2><p>These links leave Firepoint and open information from the named provider. Check the source and its update time there.</p></div>
            <div className="source-cards">
              {LINKS.map((link) => <a key={link.index} className="source-card" href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${link.label} — opens external site in a new tab`}>
                <span className="card-index">{link.index} / OFFICIAL LINK</span>
                <span className="card-arrow" aria-hidden="true">↗</span>
                <strong>{link.label}</strong><span className="card-purpose">{link.purpose}</span><span className="card-domain">{link.domain}</span>
              </a>)}
            </div>
            <p className="source-note">Need county-wide information? <a href="https://lacounty.gov/emergency/" target="_blank" rel="noopener noreferrer">Visit LA County emergency resources <span aria-hidden="true">↗</span></a></p>
          </section>

          <section id="prepare" className="prepare-section" aria-labelledby="prepare-heading">
            <div className="section-kicker">WHEN THERE’S A FIRE <span> / 03</span></div>
            <div className="prepare-grid">
              <div className="prepare-aside"><h2 id="prepare-heading">Ready, set,<br /><em>go.</em></h2><p>What to pack before fire season, what to do when a fire is near, and how to leave. Check off your go bag as you pack it. Your choices stay in this browser, on this device.</p><p className="prepare-urgent">If you are in danger, call 911. If officials tell you to leave, go.</p><div className="aside-decoration" aria-hidden="true">READY — SET — GO<br />BASED ON CAL FIRE GUIDANCE</div></div>
              <FireReadiness onStorage={setCanStore} />
            </div>
            {!canStore && <p className="storage-warning" role="status">Browser storage is unavailable. Changes may be lost when you leave this page.</p>}
          </section>

          <section className="area-section" aria-labelledby="area-heading"><div className="area-copy"><div className="section-kicker">OPTIONAL REFERENCE <span> / 04</span></div><h2 id="area-heading">A place in mind.</h2><p>Save a neighborhood label to personalize this device. This is not an address lookup, an official zone, or a check for local hazards.</p></div><div className="area-card"><div className="area-card-top"><span className="area-dot" aria-hidden="true" /> GLENDALE REFERENCE</div><strong>Glenoaks Canyon</strong><span className="area-disclaimer">Approximate neighborhood name only</span><button type="button" className="area-button" onClick={saveArea} disabled={!ready}>{area ? "Remove saved label" : "Save on this device"} <span aria-hidden="true">{area ? "×" : "+"}</span></button>{area && <p className="saved-note" role="status">Saved locally. For your official evacuation zone, use Glendale Fire’s Know Your Zone link above.</p>}</div></section>
          <div className="map-section"><div className="section-kicker">ORIENT YOURSELF <span> / 05</span></div><AreaMap /></div>
        </div>
      </main>
      <footer className="footer"><div className="footer-inner"><div><span className="footer-brand">firepoint<span>.</span></span><p>Prepare here. Confirm with the source.</p></div><div className="footer-links"><a href="#official">Official links ↑</a><a href="#prepare">Your list ↑</a></div><p className="footer-fine">Independent community tool · No live alerts, official zone lookup, or all-clear information. In an emergency, follow local officials. Call 911 for immediate help.</p></div></footer>
    </div>
  );
}
