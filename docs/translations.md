# Translations

Firepoint offers **English, Spanish and Eastern Armenian**, reflecting Glendale's largest non-English-speaking communities. Eastern Armenian uses reformed orthography and the polite plural; Spanish uses formal "usted" with common Latin American vocabulary.

**Status: the Spanish and Armenian text is unofficial and needs review by native speakers before any resident launch.** Each translated page says so and links back to English.

## What is translated

| Surface | Status |
| --- | --- |
| `/prepare` wildfire guide | Translated: [`wildfire-guide.es.ts`](../src/domain/wildfire-guide.es.ts), [`wildfire-guide.hy.ts`](../src/domain/wildfire-guide.hy.ts) |
| Map screen and route bar (`/`) | Not yet. Waits for the open map PRs to land, then uses the same locale system |
| `public/offline.html` | English only (a static fallback; tests keep it in sync with the English guide) |
| Official notices, agency names, photo credits | Never translated: shown as published |

## Safety rules for translators

- **Official evacuation terms stay visible in English.** Alerts arrive in English, so each translated term (for example "Orden de evacuación") shows the exact English wording ("Evacuation Order") beside it.
- Keep "911" and every link exactly as in English. Tests check this.
- The six P's keep their English words ("People · Personas") so the mnemonic still works.
- Never soften or add meaning. When unsure, stay closer to the English and flag it for review.

## How it works

- `src/i18n/locales.ts` lists the languages. The choice comes from the `firepoint.lang` cookie, set by plain links to `GET /api/lang?to=es&next=/prepare`, and otherwise from the browser's `Accept-Language`.
- `GuideContent` in [`wildfire-guide.ts`](../src/domain/wildfire-guide.ts) is the English shape; each translation must match it. [`guide-content.test.ts`](../src/domain/guide-content.test.ts) fails if a section, list item or string is missing, or if a string was left in English.
- Armenian pages load Noto Sans/Serif Armenian, since the guide's Latin fonts have no Armenian letters.

## Reviewing a translation

Edit the `.es.ts` or `.hy.ts` file directly; each entry sits in the same order as the English file. Run `npm test` afterwards. Once a native speaker has reviewed a language, note who reviewed it and when here, and consider softening the on-page "unofficial" notice.
