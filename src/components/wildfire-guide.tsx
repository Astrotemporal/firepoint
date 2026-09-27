import Image from "next/image";
import Link from "next/link";
import { DEFENSIBLE_SPACE_BANDS, RING_DASH, ringStack } from "@/domain/ring-visual";
import { PHOTOS, SOURCES, TERMS, ZONES, type GuideContent, type Source } from "@/domain/wildfire-guide";
import { guideContent } from "@/domain/guide-content";
import type { Locale } from "@/i18n/locales";
import { LanguageSelect } from "./language-select";
import { RegisterServiceWorker } from "./register-service-worker";

type Photo = (typeof PHOTOS)[keyof typeof PHOTOS];
type PhotoKey = keyof typeof PHOTOS;
type Group = GuideContent["beforeLeaving"][number];

const CHAPTERS = [
  { id: "ready", numeral: "I", photo: "ready" },
  { id: "set", numeral: "II", photo: "set" },
  { id: "go", numeral: "III", photo: "go" },
] as const satisfies readonly { id: string; numeral: string; photo: PhotoKey }[];

function Out({ source, label, c, children }: { source: Source; label?: string; c: GuideContent; children?: React.ReactNode }) {
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer">
      {children ?? label ?? source.label}<span aria-hidden="true"> ↗</span><span className="sr-only"> {c.ui.opensNewTab}</span>
    </a>
  );
}

function Credit({ photo, c }: { photo: Photo; c: GuideContent }) {
  return (
    <figcaption className="g-credit">
      {/* Photo credits stay in their original English, as published. */}
      <span lang="en">{photo.credit}</span> · <a href={photo.url} target="_blank" rel="noopener noreferrer">{c.ui.publicDomain}<span className="sr-only"> {c.ui.opensNewTab}</span></a>
    </figcaption>
  );
}

/** Photo card that opens each chapter, with the chapter title set over the image. */
function ChapterHead({ index, c }: { index: 0 | 1 | 2; c: GuideContent }) {
  const chapter = CHAPTERS[index];
  const text = c.chapters[index];
  const photo = PHOTOS[chapter.photo];
  return (
    <figure className="g-chapter-head">
      <div className="g-photo">
        <Image src={photo.src} alt={c.photoAlts[chapter.photo]} width={photo.width} height={photo.height}
          sizes="(max-width: 760px) 100vw, 720px" />
        <div className="g-photo-text">
          <p className="g-kicker">{c.ui.chapter} {chapter.numeral} · {text?.topic}</p>
          <h2 id={`${chapter.id}-title`}>{text?.word}<span className="g-bang">!</span></h2>
          <p className="g-dek">{text?.line}</p>
        </div>
      </div>
      <Credit photo={photo} c={c} />
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
function ZoneRings({ c }: { c: GuideContent }) {
  const scale = 0.9;
  // The ring-visual contract sets the drawing order and the dashed outer edge (shared with the map's private halos).
  const bands = ringStack(DEFENSIBLE_SPACE_BANDS);
  return (
    <svg className="g-rings" viewBox="-190 -190 380 380" role="img" aria-label={c.ui.ringsLabel}>
      {bands.map((edge) => (
        <circle key={edge.ring.name} r={edge.radius * scale} className={`g-ring g-ring-${edge.ring.band}`}
          strokeDasharray={edge.dashed ? RING_DASH.join(" ") : undefined} />
      ))}
      <rect x="-9" y="-9" width="18" height="18" className="g-house" />
      {ZONES.map((zone) => (
        <text key={zone.name} x="0" y={-zone.feet * scale + (zone.feet === 30 ? 11 : 16)} textAnchor="middle" className="g-ring-label">
          {zone.feet} {c.ui.feet}
        </text>
      ))}
    </svg>
  );
}

/**
 * /prepare: a read-only, magazine-style wildfire guide based on the fire department's Ready! Set! Go! plan,
 * in English, Spanish or Eastern Armenian. Official evacuation terms always also appear in English.
 */
export function WildfireGuide({ locale = "en" }: { locale?: Locale } = {}) {
  const c = guideContent(locale);
  const translated = locale !== "en";
  const [ready, set, go] = c.ui.coverTitle;
  return (
    <div className="guide" lang={locale}>
      <RegisterServiceWorker />
      <header className="g-appbar">
        <Link className="g-back" href="/">{c.ui.back}</Link>
        <span className="g-appbar-title">{c.ui.title}</span>
        <div className="g-appbar-end">
          <LanguageSelect current={locale} label={c.ui.languageLabel} returnTo="/prepare" className="g-lang-select" />
          <Link className="brand g-appbar-brand" href="/" aria-label={c.ui.brandLabel}>
            <span className="brand-mark" aria-hidden="true"><span /></span>
          </Link>
        </div>
      </header>
      <nav className="g-chips" aria-label={c.ui.chaptersLabel}>
        {CHAPTERS.map((chapter, i) => <a key={chapter.id} href={`#${chapter.id}`}>{c.chapters[i]?.word}</a>)}
      </nav>

      <main className="g-main">
        {translated && (
          <p className="g-translation-note" role="note">
            {c.ui.translationNotice} <a href="/api/lang?to=en&next=%2Fprepare" lang="en" hrefLang="en">{c.ui.readInEnglish}</a>
          </p>
        )}

        <section className="g-cover" aria-labelledby="guide-title">
          <figure>
            <div className="g-photo g-photo-cover">
              <Image src={PHOTOS.cover.src} alt={c.photoAlts.cover} width={PHOTOS.cover.width} height={PHOTOS.cover.height}
                sizes="(max-width: 760px) 100vw, 720px" priority />
              <div className="g-photo-text">
                <p className="g-kicker">{c.ui.coverKicker}</p>
                <h1 id="guide-title">{ready}<br />{set}<br /><em>{go}</em></h1>
              </div>
            </div>
            <Credit photo={PHOTOS.cover} c={c} />
          </figure>
          <p className="g-cover-dek">{c.ui.coverDek}</p>
          <aside className="g-urgent" aria-label={c.ui.emergencyLabel}>
            <p><strong>{c.ui.urgentCall}</strong> {c.ui.urgentNote}</p>
            <p className="g-urgent-links"><Out source={SOURCES.zone} c={c}>{c.ui.checkZone}</Out><Out source={SOURCES.alerts} c={c}>{c.ui.signUpAlerts}</Out></p>
          </aside>
        </section>

        <nav className="g-contents g-card" aria-labelledby="contents-title">
          <h2 id="contents-title" className="g-kicker">{c.ui.inside}</h2>
          <ol>
            {CHAPTERS.map((chapter, i) => (
              <li key={chapter.id}>
                <a href={`#${chapter.id}`}>
                  <span className="g-contents-numeral" aria-hidden="true">{chapter.numeral}</span>
                  <span><strong>{c.chapters[i]?.word}! <span>{c.chapters[i]?.topic}</span></strong><small>{c.chapters[i]?.line}</small></span>
                  <span className="g-chevron" aria-hidden="true">›</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="g-chapter" id="ready" aria-labelledby="ready-title">
          <ChapterHead index={0} c={c} />
          <section className="g-card">
            <h3>{c.ui.defensibleTitle}</h3>
            <p className="g-lede">{c.ui.defensibleLede}</p>
            <figure className="g-figure">
              <ZoneRings c={c} />
              <figcaption>{c.ui.ringsCaption}</figcaption>
            </figure>
            <div className="g-zones">
              {c.zones.map((zone) => (
                <section key={zone.name} className="g-zone">
                  <h4>{zone.name} <span>{zone.reach}</span></h4>
                  <ul>{zone.items.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ))}
            </div>
          </section>

          <blockquote className="g-pull">
            <p>“{c.ui.quoteEmbers}”</p>
            <cite>{c.ui.quoteSource}</cite>
          </blockquote>

          <section className="g-card">
            <h3>{c.ui.hardenTitle}</h3>
            <ol className="g-home">
              {c.home.map((item) => <li key={item.part}><strong>{item.part}</strong><span>{item.tip}</span></li>)}
            </ol>
          </section>
        </article>

        <article className="g-chapter" id="set" aria-labelledby="set-title">
          <ChapterHead index={1} c={c} />
          <section className="g-card">
            <h3>{c.ui.planTitle}</h3>
            <p className="g-lede">{c.ui.planLede}</p>
            <dl className="g-plan">
              {c.plan.map((item) => <div key={item.q}><dt>{item.q}</dt><dd>{item.a}</dd></div>)}
            </dl>
          </section>
          <section className="g-card g-kit" aria-labelledby="kit-title">
            <p className="g-kicker">{c.ui.kitKicker}</p>
            <h3 id="kit-title">{c.ui.kitTitle}</h3>
            <p className="g-lede">{c.ui.kitLede}</p>
            <ul>{c.kit.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>

          <section className="g-card g-sixps" aria-labelledby="sixps-title">
            <h3 id="sixps-title">{c.ui.sixPsTitle}</h3>
            <p>{c.ui.sixPsLede}</p>
            <ol>{c.sixPs.map((item) => <li key={item.p}><strong>{item.p}</strong><span>{item.detail}</span></li>)}</ol>
          </section>

          <section className="g-card">
            <h3>{c.ui.beforeLeavingTitle}</h3>
            <Columns groups={c.beforeLeaving} />
          </section>
        </article>

        <article className="g-chapter" id="go" aria-labelledby="go-title">
          <ChapterHead index={2} c={c} />
          <blockquote className="g-pull g-pull-large">
            <p>“{c.ui.quoteLeaveEarly}”</p>
            <cite>{c.ui.quoteSource}</cite>
          </blockquote>

          <section className="g-card" aria-labelledby="terms-title">
            <h3 id="terms-title">{c.ui.termsTitle}</h3>
            <p className="g-lede">{c.ui.termsLedeBefore} <Out source={SOURCES.zone} c={c}>Know Your Zone</Out> {c.ui.termsLedeAfter}</p>
            <dl className="g-terms">
              {c.terms.map((item, i) => (
                <div key={TERMS[i]?.term ?? item.term}>
                  <dt>
                    {item.term}
                    {/* Alerts arrive in English: always show the exact official wording too. */}
                    {translated && TERMS[i] && <span className="g-official"><span>{c.ui.officialTerm} </span><span lang="en">{TERMS[i].term}</span></span>}
                  </dt>
                  <dd>{item.meaning}</dd>
                </div>
              ))}
            </dl>
            <p className="g-source">{c.ui.termsQuoted} <Out source={SOURCES.terms} label={c.sources.terms} c={c} />.</p>
          </section>

          <section className="g-card">
            <h3>{c.ui.goTitle}</h3>
            <ol className="g-steps">{c.go.map((step) => <li key={step}>{step}</li>)}</ol>
          </section>

          <section className="g-card g-trapped" aria-labelledby="trapped-title">
            <h3 id="trapped-title">{c.ui.trappedTitle}</h3>
            <p>{c.ui.trappedLede}</p>
            <Columns groups={c.trapped} tone="dark" />
          </section>

          <section className="g-card">
            <h3>{c.ui.returningTitle}</h3>
            <ul className="g-returning">{c.returning.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </article>

        <section className="g-sources g-card" aria-labelledby="sources-title">
          <h2 id="sources-title">{c.ui.sourcesTitle}</h2>
          <p>{c.ui.sourcesLede}</p>
          {locale === "en" && <p lang="en">Genasys Protect opens a third-party map <strong>centered on Glendale</strong>, not a Firepoint zone lookup.
            Search your address there and check the issuing agency. A blank map does not establish safety.</p>}
          <ul>
            {(["alerts", "zone", ...(locale === "en" ? ["genasys"] as const : []), "nws", "county", "rsg", "brochure"] as const).map((key) => (
              <li key={key}><Out source={SOURCES[key]} label={key === "genasys" ? SOURCES.genasys.label : c.sources[key]} c={c} /></li>
            ))}
          </ul>
        </section>

        <footer className="g-footer">
          <p>{c.ui.footerAdapted}</p>
          <p>{c.ui.footerDisclaimer}</p>
        </footer>
      </main>
    </div>
  );
}
