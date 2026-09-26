# Four-person hackathon scope (working split)

This is a **proposal**, not an assignment or a statement that missing integrations already work. The demo target is one defensible Glendale-area experience with direct official links, a local preparation list, and source-backed data only where coverage is verified. Tentative pilot: **Glenoaks Canyon as a City reference neighborhood**, not an evacuation zone or a risk ranking. Agree on the pilot with the team before presenting it as selected.

| Owner | Owns / can work independently | Demonstrable acceptance | Do not claim |
| --- | --- | --- | --- |
| 1. Resident experience + accessibility | Mobile-first UI, empty/loading/offline states, checklist, screen reader, large text and manual area choice. Own `src/components/`, `src/app/` presentation and screenshots. | Phone + desktop keyboard checks; offline checklist survives reload; no-data is clear; agency links work. Optional read-aloud uses source text with visible transcript. | That an unconnected route produces live evacuation status, or ElevenLabs/Glendale IT is already integrated. |
| 2. Geography + map | Display-only MapLibre/OpenFreeMap layer, official City reference neighborhoods when reuse rights are verified, GIS MCP feasibility, source vintage and coverage tests. Own map components and GIS adapters. | Map loads with attribution when online; fails visibly offline; no invented polygon/zone; verify point-in-polygon against the publisher's actual footprint. | A basemap/City neighborhood/CAL FIRE hazard class is a standing evacuation zone. |
| 3. Official-source backend | Versioned Zod wire contract, NWS point-alert adapter (already started), Cal OES/LA County **active** evacuation views, source-registry clocks, stale/outage and overlap handling. Own `src/domain/`, `src/server/`, `src/app/api/`. | Synthetic tests for schema drift, blank/outage/partial/expired feeds; original issuer/URL and last successful check visible; no all-clear from zero records. | A weather warning is an order, or the NWS-only route covers city evacuations. |
| 4. Community signal + quality/ops | Draft/report **design and privacy**; a real submission only if moderated durable receipt and takedown can ship. Own report-specific paths, release checklist, Makefile/CI, source-rights and demo evidence. | `make check`/CI green; every demo claim maps to a working screen or original source; public report feed remains disabled until moderation works. | Votes/heatmaps confer official verification; an offline draft was dispatched. |

## Integration order

1. Agree on the resident question and pilot coverage. Write exact user story and **what remains unknown**. Each owner works in distinct files or feature branches to avoid UI/backend overlap.
2. Owner 3 publishes an adapter contract with provenance and failure fixtures. Owner 2 publishes validated map coverage + license/attribution evidence. Owner 1 binds only real, parsed records; unavailable is the default. Owner 4 validates error/offline and readiness claims.
3. Join on one walkthrough: save an area voluntarily → open cited mapped preparedness context (only if integrated) → inspect official current-source status → follow publisher link → edit checklist offline. Never infer an evacuation decision from the app.
4. Report feature and AI voice/assistant are **stretch goals** after agency/source review. With four people and one day, a trustworthy partial prototype scores better than unsupported live-safety claims.

## Cross-review handoffs

- UI ↔ backend: import `src/domain/contracts.ts`; never handwrite duplicate payload types. Include loading, down, stale and no-match states in screenshots.
- Map ↔ sources: never compute official zone membership from OpenFreeMap tiles or a camera center; use agency polygons and document version/coverage. The existing City `neighborhood_zones` are references only.
- Reports ↔ operations: keep drafts on-device if no moderated server exists; publish no community pin from an unreviewed submission. Privacy and takedown must be designed together.
- Everyone: record source URL, issuer vs aggregator, vintage/checked time, geographic scope, license, and who tested the output. `npm run lint && npm run typecheck && npm test && npm run build` (or `make check`) are required but **not proof of emergency readiness**.

See [Citizen-inspired user stories](user-stories.md), [source roadmap](source-roadmap.md), and [team start](team-start.md). Map provider decisions need their own review before a map ships. If another branch changes `README.md` on `main`, rebase and resolve that text together; do not overwrite teammates' copy just to add these links.
