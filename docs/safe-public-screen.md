# Safe public screen — architecture note

**Branch:** `feat/public-drawer-safe` (PR #37, HEAD `758d308`)  
**Status:** Preserved standalone — do not rebase onto gate-free main (`89ac4cf`).

## What this branch contains

A source-gated public homepage (`PublicMapScreen` + `PublicInfoDrawer`) that shows:

- Full Mapbox basemap with private fire-mark tool (no geolocation, no routes)
- Draggable bottom drawer with two explicit source-aware empty states:
  - *Shelter status unavailable — no verified open-shelter feed loaded*
  - *Evacuation status unavailable — check issuing agency*
- Static map-symbol legend (explanation only, no live data):
  - Grey dashed ring — private mark, this device only
  - Yellow circle — 3+ unreviewed reports · may include repeat submissions · not a confirmed hazard
  - Red — agency-confirmed active source notice
- "This is not an all-clear" notice, official source links, private-mark disclaimer
- Typed future slots: `VerifiedShelterSnapshot`, `VerifiedNoticeSnapshot` (unpopulated)
- EN/ES/HY locale support (existing reviewed guide translations only; no new safety text invented)
- PR#35 help modal (`variant="public"`) and PR#38 in-app nav CSS coexist intact

## Prerequisites to land this on main

1. **Restore the release gate** (`src/server/release-gate.ts` + `page.tsx` conditional)  
   or establish a separate route (e.g. `/map`) for the source-backed screen.
2. **Restore or re-implement the smoke CI job** (`scripts/smoke-public-home.mjs` +
   `.github/workflows/ci.yml` public-gate-smoke step) — already updated in this branch.
3. **Service worker:** bump `PUBLIC_SHELL_MARKER` → `"ev-pub-sheet"` and
   `CACHE` → `"firepoint-shell-v6"` in `public/sw.js` — already done in this branch.
4. **Verified source adapters** (future PRs): populate `shelterSnapshot` /
   `noticeSnapshot` props with freshness-stamped, Zod-validated server data only.
   - FEMA NSS Open Shelters: coverage incomplete; zero ≠ all-clear
   - LA County Genasys active-alert layer: issuer/retraction/geometry rights unverified
   - NWS alerts proxy (`/api/weather`) currently 501

## Local screenshots (production build, real Mapbox basemap)

| File | Shows |
|------|-------|
| `/tmp/fp-final-peek.png` | Map + colored toolbox flame + drawer peek |
| `/tmp/fp-final-mark-placed.png` | Placed grey private pin + halo + colored toolbox |
| `/tmp/fp-final-expanded.png` | Drawer expanded: not-all-clear + legend + links |

## Key safety constraints encoded in this branch

- No hardcoded shelter names, open statuses, escape routes, geolocation or Mapbox Directions
- `ev-pub-*` CSS class names keep prototype gate tests clean (no `ev-sheet`/`ev-bar` overlap)
- `lang=en` on drawer; non-English reuses only reviewed `/prepare` guide translations
- Tests: 301 pass · `tsc --noEmit` clean · `npm run build` clean · smoke passes locally
