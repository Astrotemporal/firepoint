# Translations

Firepoint offers **English, Spanish and Eastern Armenian**, reflecting Glendale's largest non-English-speaking communities. Eastern Armenian uses reformed orthography and the polite plural; Spanish uses formal "usted" with common Latin American vocabulary.

**Status: the Spanish and Armenian text is unofficial and needs review by native speakers before any resident launch.** Each translated page says so and links back to English.

## What is translated

| Surface | Status |
| --- | --- |
| `/prepare` wildfire guide | Translated: [`wildfire-guide.es.ts`](../src/domain/wildfire-guide.es.ts), [`wildfire-guide.hy.ts`](../src/domain/wildfire-guide.hy.ts) |
| Map screen, directions drawer, fire marks and map popups (`/`) | Translated: [`src/i18n/map.ts`](../src/i18n/map.ts), shared through `MapTextProvider` / `useMapText` ([`map-text.tsx`](../src/components/map-text.tsx)) |
| Turn-by-turn road steps | From Mapbox: Spanish when ES is chosen; English for Armenian, which Mapbox Directions doesn't support |
| Shelter names, addresses, evacuation-point descriptions, feed hazard labels | Never translated: data shown as published |
| `public/offline.html` | English only (a static fallback; tests keep it in sync with the English guide) |
| Official notices, agency names, photo credits | Never translated: shown as published |

## Safety rules for translators

- **Official evacuation terms stay visible in English.** Alerts arrive in English, so each translated term (for example "Orden de evacuación") shows the exact English wording ("Evacuation Order") beside it.
- Keep "911" and every link exactly as in English. Tests check this.
- The six P's keep their English words ("People · Personas") so the mnemonic still works.
- Never soften or add meaning. When unsure, stay closer to the English and flag it for review.

## How it works

- `src/i18n/locales.ts` lists the languages. An **EN / ES / AM select** sits in the top-right corner of the map and the guide ([`language-select.tsx`](../src/components/language-select.tsx)). "AM" is the label residents recognize; the code stays ISO `hy`.
- Choosing a language calls `GET /api/lang?to=es&next=<this page>`, which saves the `firepoint.lang` cookie and returns. Without JavaScript the select falls back to plain links. With no saved choice, the browser's `Accept-Language` decides.
- `GuideContent` in [`wildfire-guide.ts`](../src/domain/wildfire-guide.ts) is the English shape; each translation must match it. [`guide-content.test.ts`](../src/domain/guide-content.test.ts) fails if a section, list item or string is missing, or if a string was left in English.
- Armenian pages load Noto Sans/Serif Armenian, since the guide's Latin fonts have no Armenian letters.

## Reviewing a translation

For the guide, edit the `.es.ts` or `.hy.ts` file directly. For the map, edit the `MAP_ES` or `MAP_HY` block in `src/i18n/map.ts`. Each entry sits in the same order as English, and [`map.test.tsx`](../src/i18n/map.test.tsx) checks that every entry exists and keeps its inserted values and 911. Run `npm test` afterwards. Once a native speaker has reviewed a language, note who reviewed it and when here, and consider softening the on-page "unofficial" notice.
