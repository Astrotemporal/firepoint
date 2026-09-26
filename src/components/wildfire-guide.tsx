import Image from "next/image";
import Link from "next/link";
import {
  BEFORE_LEAVING, GO, HOME, KIT, PHOTOS, PLAN, RETURNING, SIX_PS, SOURCES, TERMS, TRAPPED, ZONES, type Group, type Source,
} from "@/domain/wildfire-guide";
import { RegisterServiceWorker } from "./register-service-worker";

type Photo = (typeof PHOTOS)[keyof typeof PHOTOS];

const CHAPTERS = [
  { id: "ready", numeral: "I", word: "Ready", topic: "Your home", line: "Clear the space around your house and seal it against embers.", photo: PHOTOS.ready },
  { id: "set", numeral: "II", word: "Set", topic: "Your family", line: "Make a plan, pack a kit, and know what to do before you leave.", photo: PHOTOS.set },
  { id: "go", numeral: "III", word: "Go", topic: "Leaving", line: "Leave early, know the official terms, and what to do if trapped.", photo: PHOTOS.go },
] as const;

function Out({ source, children }: { source: Source; children?: React.ReactNode }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer">
      {children ?? source.label}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Credit({ photo }: { photo: Photo }) {
  return (
    <figcaption className="g-credit">
      {photo.credit} · <a href={photo.url} target="_blank" rel="noopener noreferrer">public domain<span className="sr-only"> (opens in a new tab)</span></a>
    </figcaption>
  );
}

/** Photo card that opens each chapter, with the chapter title set over the image. */
function ChapterHead({ index }: { index: 0 | 1 | 2 }) {
  const chapter = CHAPTERS[index];
  return (
    <figure className="g-chapter-head">
      <div className="g-photo">
        <Image src={chapter.photo.src} alt={chapter.photo.alt} width={chapter.photo.width} height={chapter.photo.height}
          sizes="(max-width: 760px) 100vw, 720px" />
        <div className="g-photo-text">
          <p className="g-kicker">Chapter {chapter.numeral} · {chapter.topic}</p>
          <h2 id={`${chapter.id}-title`}>{chapter.word}<span className="g-bang">!</span></h2>
          <p className="g-dek">{chapter.line}</p>
        </div>
      </div>
      <Credit photo={chapter.photo} />
    </figure>
  );
}

function Columns({ groups, tone }: { groups: readonly Group[]; tone?: "dark" }) {
  return (
    <div className={`g-columns${tone ? ` g-columns-${tone}` : ""}`}>
      {groups.map((group) => (
        <div key={group.title}>
          <h4>{group.title}</h4>
          <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

/** Concentric defensible-space rings, drawn to scale (30 / 100 / 200 ft). */
function ZoneRings() {
  const scale = 0.9;
  return (
    <svg className="g-rings" viewBox="-190 -190 380 380" role="img"
      aria-label="Defensible space: Zone 1 is 0 to 30 feet from the house, Zone 2 is 30 to 100 feet, Zone 3 is 100 to 200 feet.">
      {[...ZONES].reverse().map((zone, i) => (
        <circle key={zone.name} r={zone.feet * scale} className={`g-ring g-ring-${3 - i}`} />
      ))}
      <rect x="-9" y="-9" width="18" height="18" className="g-house" />
      {ZONES.map((zone) => (
        <text key={zone.name} x="0" y={-zone.feet * scale + (zone.feet === 30 ? 11 : 16)} textAnchor="middle" className="g-ring-label">
          {zone.feet} ft
        </text>
      ))}
    </svg>
  );
}

/** /prepare: a read-only, magazine-style wildfire guide based on the fire department's Ready! Set! Go! plan. */
export function WildfireGuide() {
  return (
    <div className="guide">
      <RegisterServiceWorker />
      <header className="g-appbar">
        <Link className="g-back" href="/">Map</Link>
        <span className="g-appbar-title">Wildfire guide</span>
        <Link className="brand g-appbar-brand" href="/" aria-label="Firepoint map">
          <span className="brand-mark" aria-hidden="true"><span /></span>
        </Link>
      </header>
      <nav className="g-chips" aria-label="Chapters">
        {CHAPTERS.map((chapter) => <a key={chapter.id} href={`#${chapter.id}`}>{chapter.word}</a>)}
      </nav>

      <main className="g-main">
        <section className="g-cover" aria-labelledby="guide-title">
          <figure>
            <div className="g-photo g-photo-cover">
              <Image src={PHOTOS.cover.src} alt={PHOTOS.cover.alt} width={PHOTOS.cover.width} height={PHOTOS.cover.height}
                sizes="(max-width: 760px) 100vw, 720px" priority />
              <div className="g-photo-text">
                <p className="g-kicker">A wildfire guide for Glendale</p>
                <h1 id="guide-title">Ready.<br />Set.<br /><em>Go.</em></h1>
              </div>
            </div>
            <Credit photo={PHOTOS.cover} />
          </figure>
          <p className="g-cover-dek">Wildfires here are fed by dry brush and driven by strong, dry winds, and very few residents prepare to evacuate until it is too late. This is what firefighters ask you to do: before fire season, when a fire is near, and when it’s time to leave. Based on the LA County Fire Department’s Ready! Set! Go! plan.</p>
          <aside className="g-urgent" aria-label="Emergency">
            <p><strong>In danger? Call 911.</strong> Firepoint is not an alert system and does not check evacuation orders or your zone.</p>
            <p className="g-urgent-links"><Out source={SOURCES.zone}>Check your zone</Out><Out source={SOURCES.alerts}>Sign up for Glendale Alerts</Out></p>
          </aside>
        </section>

        <nav className="g-contents g-card" aria-labelledby="contents-title">
          <h2 id="contents-title" className="g-kicker">Inside</h2>
          <ol>
            {CHAPTERS.map((chapter) => (
              <li key={chapter.id}>
                <a href={`#${chapter.id}`}>
                  <span className="g-contents-numeral" aria-hidden="true">{chapter.numeral}</span>
                  <span><strong>{chapter.word}! <span>{chapter.topic}</span></strong><small>{chapter.line}</small></span>
                  <span className="g-chevron" aria-hidden="true">›</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="g-chapter" id="ready" aria-labelledby="ready-title">
          <ChapterHead index={0} />
          <section className="g-card">
            <h3>Defensible space</h3>
            <p className="g-lede">Defensible space is the buffer between your house and the landscape around it. It slows a fire down and gives firefighters room to stand between your home and the flames. It runs 200 feet out, in three zones.</p>
            <figure className="g-figure">
              <ZoneRings />
              <figcaption>Three zones, 200 feet in all. Your house sits at the center.</figcaption>
            </figure>
            <div className="g-zones">
              {ZONES.map((zone) => (
                <section key={zone.name} className="g-zone">
                  <h4>{zone.name} <span>{zone.reach}</span></h4>
                  <ul>{zone.items.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ))}
            </div>
          </section>

          <blockquote className="g-pull">
            <p>“Windblown embers from a wildfire will find the weak link in your home’s fire protection scheme.”</p>
            <cite>Ready! Set! Go! Wildfire Action Plan</cite>
          </blockquote>

          <section className="g-card">
            <h3>Harden your home</h3>
            <ol className="g-home">
              {HOME.map((item) => <li key={item.part}><strong>{item.part}</strong><span>{item.tip}</span></li>)}
            </ol>
          </section>
        </article>

        <article className="g-chapter" id="set" aria-labelledby="set-title">
          <ChapterHead index={1} />
          <section className="g-card">
            <h3>Your wildfire action plan</h3>
            <p className="g-lede">Make it with everyone in your household, well before fire season. Practice it, and post it where you can find it fast.</p>
            <dl className="g-plan">
              {PLAN.map((item) => <div key={item.q}><dt>{item.q}</dt><dd>{item.a}</dd></div>)}
            </dl>
          </section>
          <section className="g-card g-kit" aria-labelledby="kit-title">
            <p className="g-kicker">One per person</p>
            <h3 id="kit-title">Emergency supply kit</h3>
            <p className="g-lede">A backpack works well. Keep food and water in a tub you can lift into the car.</p>
            <ul>{KIT.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="g-card g-sixps" aria-labelledby="sixps-title">
            <h3 id="sixps-title">Remember the six P’s</h3>
            <p>If you have minutes, not hours, grab these.</p>
            <ol>{SIX_PS.map((item) => <li key={item.p}><strong>{item.p}</strong><span>{item.detail}</span></li>)}</ol>
          </section>

          <section className="g-card">
            <h3>If an evacuation is coming and there’s time</h3>
            <Columns groups={BEFORE_LEAVING} />
          </section>
        </article>

        <article className="g-chapter" id="go" aria-labelledby="go-title">
          <ChapterHead index={2} />
          <blockquote className="g-pull g-pull-large">
            <p>“By leaving early, you will give your family the best chance of surviving a wildfire.”</p>
            <cite>Ready! Set! Go! Wildfire Action Plan</cite>
          </blockquote>

          <section className="g-card" aria-labelledby="terms-title">
            <h3 id="terms-title">Know the official terms</h3>
            <p className="g-lede">Officials use these words in alerts. Follow them immediately. Check <Out source={SOURCES.zone}>Know Your Zone</Out> for your area.</p>
            <dl className="g-terms">
              {TERMS.map((item) => <div key={item.term}><dt>{item.term}</dt><dd>{item.meaning}</dd></div>)}
            </dl>
            <p className="g-source">Terms quoted from <Out source={SOURCES.terms} />.</p>
          </section>

          <section className="g-card">
            <h3>When a wildfire starts</h3>
            <ol className="g-steps">{GO.map((step) => <li key={step}>{step}</li>)}</ol>
          </section>

          <section className="g-card g-trapped" aria-labelledby="trapped-title">
            <h3 id="trapped-title">If you become trapped</h3>
            <p>Stay calm. Call 911 and tell them where you are.</p>
            <Columns groups={TRAPPED} tone="dark" />
          </section>

          <section className="g-card">
            <h3>Coming home</h3>
            <ul className="g-returning">{RETURNING.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </article>

        <section className="g-sources g-card" aria-labelledby="sources-title">
          <h2 id="sources-title">Keep these open</h2>
          <p>Firepoint only explains the guidance. For orders, zones and conditions, go to the source.</p>
          <p>Genasys Protect opens a third-party map <strong>centered on Glendale</strong>, not a Firepoint zone lookup.
            Search your address there and check the issuing agency. A blank map does not establish safety.</p>
          <ul>
            {[SOURCES.alerts, SOURCES.zone, SOURCES.genasys, SOURCES.nws, SOURCES.county, SOURCES.rsg, SOURCES.brochure].map((source) => (
              <li key={source.url}><Out source={source} /></li>
            ))}
          </ul>
        </section>

        <footer className="g-footer">
          <p>Adapted from the County of Los Angeles Fire Department’s Ready! Set! Go! Wildfire Action Plan (revised May 20, 2026). Photos are US government works in the public domain.</p>
          <p>Independent community tool, not a government service. General guidance only: no live alerts, zone lookup, or all-clear information. In an emergency, follow local officials. Call 911 for immediate help.</p>
        </footer>
      </main>
    </div>
  );
}
