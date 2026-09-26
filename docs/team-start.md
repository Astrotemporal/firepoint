# Team start

This is the working guide for the **new Firepoint repository**. Read [source policy](source-policy.md) before changing any safety-related text, map, feed, cache, or user-data flow. The product direction includes proposed features; check the code before calling any feature shipped. A local UI or source adapter is not operational live coverage.

## Local setup and routine

1. Clone this repository and use the checked-in npm lockfile. From the repository root run `npm ci`, then `npm run dev`; open <http://localhost:3000>.
2. Make one focused change on a branch. Write down what the user can actually do after the change and what remains unavailable. Do not present proposed work as shipped.
3. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before review. These scripts now exist. Include manual checks for small-screen use, keyboard access, and offline/error states when relevant. A passing adapter test does not mean its data reaches the UI.
4. In the pull request, give the changed behavior, source/provenance and permission evidence (if any), coverage and freshness limits, screenshots for UI changes, and commands run. Review safety copy and privacy consequences explicitly. Never put provider keys, location histories, or private reports in commits, logs, screenshots, or tickets.
5. Deploy only after reviewing source rights and operational ownership. A successful build is not proof of reliable live alerts, offline maps, scheduled polling, or moderation.

This project uses Next.js 16, React 19, TypeScript, Tailwind CSS 4, and npm in its starter. Before editing Next.js behavior, read the installed docs under `node_modules/next/dist/docs/` and the repository's `AGENTS.md`; do not assume older Next.js APIs apply.

## Product boundaries for proposals

- **Area selection:** let people enter or choose an area manually. If device location is added, ask permission at the moment of use, make it optional, and do not persist precise coordinates by default. An approximate neighborhood or camera center is not an official boundary.
- **Agency information:** link to the issuing agency and show its actual notice/status only after the source is validated for that location and time. Never calculate evacuation orders, travel decisions, fire arrival, or an all-clear.
- **Standing maps:** show sourced hazard layers as background planning context, with date and coverage. A hazard polygon is not a current incident notice.
- **Preparation:** a checklist or saved area may be local-first, but saving requires a clear user action and a way to remove data, especially on shared devices. An app shell alone does not give offline maps or current alerts.
- **Community reports:** do not ship public submission or map pins until consent, moderation, abuse handling, location protection, retention/deletion, and operating capacity exist. An unverified report must remain visually and semantically separate from agency notices.

A tentative Glenoaks Canyon pilot may use a City reference neighborhood to scope discovery. Confirm its name, geometry, license, and limits before use. **Glenoaks Canyon is not an evacuation zone**, and a neighborhood match cannot be promoted into an evacuation-zone lookup. Do not imply City sponsorship.

## Shared contract and the first backend route

[`src/domain/contracts.ts`](../src/domain/contracts.ts) is the v1 Zod source of truth. [Contract guide](contracts.md) explains UI parsing, source clocks, storage, and the proposed trust lanes. The only implemented source adapter is [`src/server/nws.ts`](../src/server/nws.ts), for NWS **weather** alerts. `POST /api/v1/notices/query` requires a JSON body containing a `[longitude,latitude]` point and `userInitiated: true`; it is inactive unless `NWS_USER_AGENT` has an identifying app contact in ignored `.env.local`. The route never represents an evacuation order, all-clear, or Glendale zone lookup. Its response has `allClear: false`, NWS source health, and original upstream links; it returns 503 with an explicit unavailable state if configuration or the source fails. The current page does **not** call this route. Exact personal coordinates are not placed in a browser GET URL or analytics; the NWS point service receives the queried point when a resident explicitly asks.

Future browser features should call app-owned server endpoints for keyed sources. Server code must validate publisher payloads and preserve issue time, last successful retrieval, applicability, and original record URL. No GIS or ElevenLabs key belongs in browser variables or logs. For each feature, name its data owner, user-facing no-data state, cache rule, accessibility behavior, privacy effect, and source-specific acceptance test before adding UI status. A blank upstream response cannot mean safe.

## Hackathon GIS setup (optional developer tool; not app integration)

The [Glendale GIS MCP server](https://github.com/HackerFund/GlendaleGisMcp) exposes preparedness-oriented map datasets through Model Context Protocol (MCP). It is not a live alert feed. For a local, keyless developer session, install [uv](https://docs.astral.sh/uv/) and run this pinned revision from a terminal (first command downloads and verifies its snapshot, then exits):

```bash
uvx --from git+https://github.com/HackerFund/GlendaleGisMcp@59beb3409a7f3c5db8fbab79075ba646b8082386 glendale-gis-mcp --fetch-snapshot
```

Configure an MCP client to launch the stdio server with this command (do not run it as an HTTP app route):

```bash
uvx --from git+https://github.com/HackerFund/GlendaleGisMcp@59beb3409a7f3c5db8fbab79075ba646b8082386 glendale-gis-mcp
```

The server may download its snapshot on first use. A local MCP client configuration, if added, is for developer exploration; it does not connect the web app. The hosted server instead uses a streamable-HTTP `/mcp` endpoint and an organizer-provided `Authorization: Bearer <key>` header. Keep its endpoint and key in **server-only** environment settings (`GLENDALE_GIS_MCP_URL`, `GLENDALE_GIS_MCP_KEY` are suggested names); never expose the key through `NEXT_PUBLIC_*`, browser requests, logs, screenshots, or commits. A future app integration needs an owned server endpoint, validated source results, permissions review, and the release gates in [source policy](source-policy.md). Do not store an example real key in a checked-in MCP config. See the upstream [setup and hosted instructions](https://github.com/HackerFund/GlendaleGisMcp).

The server describes hazard layers, reference/resource layers, and `neighborhood_zones`. These are snapshot or reference GIS, not active fires, orders, evacuation zones, or evidence that an area is safe. The upstream server code is GPL-3.0-or-later; data from public agencies has separate terms and disclaimers. Review both before copying code or bundling, redistributing, or caching GIS data.

## Other event resources (optional, not official data)

The [workshop resources page](https://www.visioncityhack.app/workshops/#resources) lists developer and presentation resources. Glendale IT's virtual assistant is access-gated for the workshop; no public API or reuse right is confirmed. An ElevenLabs keynote coupon may support optional text-to-speech, but a future integration needs consent, content/privacy review, and server-side credential handling. v0 and Vercel can help prototype UI and deploy a web app, not operate an agency feed or guarantee background checks. OpenCode, OpenRouter, Exa, and Context7 are developer tools; their output is not official hazard data or evidence of coverage. Confirm each resource's current offer and terms with its owner before use. No such service is integrated by these docs.
