# Proposed `/prepare` editorial rewrite — EN only, not for publication

Status: **editorial draft; blocked on multilingual safety review and source/asset rights**. Prepared against `staging/source-backed` at `7e01315d` on 2026-09-27 (America/Los_Angeles). This document is not served by the app. It proposes *new wording*, not a translation, an agency notice, or permission to republish another publisher's guide.

## Proposed reader-facing English text

### Prepare before a wildfire

**This is a general preparation guide, not an emergency service.** Firepoint is independent of Glendale and other public agencies. It does not monitor your address, determine your evacuation zone, issue orders, or tell you when it is safe to return. For an immediate emergency, call 911. For current instructions, use the issuing agency's notices, not this page or a cached copy. [LA County emergency information](https://lacounty.gov/emergency/) · [NWS Los Angeles/Oxnard](https://www.weather.gov/lox/).

#### Make a household plan

Choose a way for household members to contact each other if they are apart. Agree on a place to meet and identify more than one possible way out of your neighborhood. Include people who need help moving, pets, and any transportation needs. Review the plan together before a fire, not during one. Keep a paper copy if power or data service is unavailable. These are planning ideas, not recommended routes for any active incident. [Ready.gov: Wildfires](https://www.ready.gov/wildfires) (FEMA, accessed 2026-09-27).

#### Put supplies where you can reach them

Set aside water, food, medicine, important contacts and document copies, a light, a way to receive information, sturdy shoes, and supplies for pets or medical needs. Check dates and replace items as your household changes. Store copies of sensitive documents with care, especially on a shared device. See [Ready.gov: Wildfires](https://www.ready.gov/wildfires) (FEMA, accessed 2026-09-27) for the agency's current preparation advice. This short list is a reminder, not a complete kit standard.

#### Reduce risks at home

Clear accumulated dry material where you can do so safely. Review roofs, vents, nearby plants and stored combustibles with a qualified local professional before changing structures or vegetation. Follow applicable local rules and property boundaries. This page does **not** calculate a defensible-space boundary or certify that a home will survive a fire. For more information, visit the [LA County Fire Department's wildfire preparation page](https://fire.lacounty.gov/rsg/) and [linked action-plan PDF](https://fire.lacounty.gov/wp-content/uploads/2026/05/Ready-Set-Go_5.20.26.pdf).

### When conditions change

Look for notices from the agency responsible for *your* location. Follow any applicable instructions from officials. Do not infer that there is no danger because this app has no notice, because a map is blank, or because the device is offline. If you feel threatened, move to safety without waiting for this app to update; follow official directions and call 911 for immediate help. Check [LA County emergency information](https://lacounty.gov/emergency/) (accessed 2026-09-27) and the relevant local agency. Firepoint does not choose a route, destination, departure time, or shelter for you.

### Check the original source

Find notices from the agency responsible for your location and check them at the original source. Firepoint has not verified your address or zone. A link may not open offline. A saved copy is not a live notice or an all-clear.

## Evidence and rights checks (2026-09-27 America/Los_Angeles)

| Candidate source | Check | Publication decision |
| --- | --- | --- |
| FEMA [Ready.gov: Wildfires](https://www.ready.gov/wildfires) | HTTP HEAD 200; page title `Wildfires \| Ready.gov` checked by GET. | Link to the original; original prose above, not an agency quotation or reproduction. |
| [LA County Fire preparation page](https://fire.lacounty.gov/rsg/) | HEAD 200, but GET returned 403 to this environment. | Link only; human review needed for content and rights. |
| [LA County Fire action-plan PDF](https://fire.lacounty.gov/wp-content/uploads/2026/05/Ready-Set-Go_5.20.26.pdf) | HEAD 200, `application/pdf`; filename includes `5.20.26`. No publication/revision date independently verified. | Link only; verify edition, date, attribution, and rights with publisher. |
| [LA County emergency information](https://lacounty.gov/emergency/) | HEAD and GET 200; page title `Emergency – COUNTY OF LOS ANGELES`. | Navigation link only; not an ingested live feed. |
| [NWS Los Angeles/Oxnard](https://www.weather.gov/lox/) | HEAD and GET 200; page title `Los Angeles, CA`. | Navigation link only; not a live alert in Firepoint. |
| Candidate [Glendale City link 1 (URL suggests Know Your Zone)](https://www.glendaleca.gov/government/departments/fire-department/other-links/emergency-preparedness-response/know-your-zone), [Glendale City link 2 (URL suggests emergency communications)](https://www.glendaleca.gov/government/departments/fire-department/other/emergency-preparedness-response/city-wide-emergency-communications), [Cal OES link (URL suggests evacuation terms)](https://calalerts.org/evacuations.html) | HEAD 403 in this environment. Page titles, content, current advice, and publisher control not verified. | Unverified link candidates, **excluded from proposed reader copy**. Confirm with publisher or human browser review before publication. No zone inference. |

A successful HEAD request shows only reachability at that moment, not currency, coverage, safety, content licensing, or agency endorsement. No source is polled here for an incident status.

## Why this is a document, not a UI change

- `src/domain/wildfire-guide.ts` supplies English for `/prepare`; `wildfire-guide.es.ts` and `wildfire-guide.hy.ts` contain distinct Spanish and Eastern Armenian safety prose. They still describe an adaptation of an agency-branded plan. Type/shape tests only check counts and basic strings; they do not certify meaning or translation. Replacing English alone would silently break editorial parity, and machine-writing new life-safety translations would not fix it.
- `src/components/wildfire-guide.tsx` contains direct quotations, official-term presentation, three 30/100/200-ft rings and photo credits; `src/app/prepare/page.tsx` loads all three languages. A revised UI needs review of headings, diagrams, attribution, alt text, metadata, footer, and the tests alongside the three locale modules. Do not treat a distance graphic as a safety measurement for a reader's parcel.
- `public/offline.html` hand-copies English leaving/trapped/kit material and says it mirrors the guide; `src/components/wildfire-guide.test.tsx` asserts this. The new text must be reviewed there as well. `public/sw.js` presently caches only shell/static assets and returns the static offline fallback for `/prepare`; do not cache guide responses until rights, locale-specific cache keys, dates, and stale/offline labels are verified. Never cache Mapbox tiles, incident data, personalized notices, or third-party pages.
- `public/guide/` bundles four photos. `PHOTOS` labels them public domain, but credits/Commons links are assertions, not proof of the original files' exact rights, provenance, derivatives, or required attribution. Check source file pages and file hashes individually and record licenses/permissions before reusing; otherwise remove images in the eventual rewrite. Avoid mimicking LA County/City typography, seals, product headings, or their characteristic layout.

### Publication checklist

1. A safety editor checks every claim against current official source pages and confirms jurisdiction, dates, and link targets in a browser. The Glendale and Cal OES URLs above returned 403; verify their page names, content, current advice, and publisher control before considering them for reader-facing links. Keep any agency order *verbatim* only where policy permits, with issuing agency, jurisdiction, issue time, source link, and staleness; this proposed general guide contains no notice.
2. Rights reviewer checks the linked PDF's edition, date, and reuse terms with the publisher, agency content, and all four photo files; records license/attribution evidence or replaces assets. Do not reproduce agency diagrams, zone measurements, quotations, or checklists without review. This original draft has no copied quotes or diagrams.
3. Qualified human reviewers prepare and approve **both** Spanish and Eastern Armenian versions against the approved English, including emergencies, negations, numbers, and external-link caveats; record reviewer, date, and version. If a locale cannot be approved, do not display a mismatched guide under that locale; provide a reviewed notice and a plain link to the reviewed language instead. No automatic safety translation.
4. Update the three locale modules, component, metadata, offline fallback, source list, and tests in one reviewed change. Test EN/ES/HY rendering, screen-reader labels, quoted terms, online and offline states, freshness language, source failures, and the no-all-clear invariant. The link hub must never imply a municipal partnership or that an outgoing link is an official Firepoint lookup.
5. Only after the review, consider static offline prep content with locale-specific versions, explicit publication/review date, and versioned invalidation. A service worker update cannot reach devices that stay offline; plan for old content to persist.
