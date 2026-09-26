# Firepoint

Firepoint is a planned, account-optional mobile web app for emergency awareness and personal preparedness in Glendale, California. Nearby Southern California coverage is a future possibility **only where source coverage and rights have been checked**. A resident should be able to choose an area, find clearly attributed hazard information and links to agency notices, and keep a personal preparation checklist. The area-specific, source-backed parts of this plan are **proposed, not shipped**; see the current status below.

**Not an official City of Glendale service.** Firepoint does not issue evacuation orders, determine whether a place is safe, or provide an all-clear. For an emergency, follow the responsible public agency and local emergency services. Do not rely on this app as your only source of information.

## What exists now

This repository began as a Next.js 16 starter and is under active development. The current UI has outbound links to named official sources, a short checklist saved only after an item is checked, and an optional Glenoaks Canyon neighborhood label saved on this device. Neither the label nor the checklist is an official lookup. A server-side `POST /api/v1/notices/query` route now supports **NWS weather alerts only** when a real `NWS_USER_AGENT` contact is configured. It returns an explicit unavailable response otherwise. The UI does not call that route yet; it does not ingest city evacuation orders or establish operational coverage. Hazard lookup, verified evacuation-zone lookup, public reporting, accounts, and an operational backend are not shipped. A service worker supplies a separate offline checklist page, but it does not cache the main app page, official notices, API responses, or maps. An offline map and live offline status are not shipped.

## Run locally

Use Node.js and npm compatible with the checked-in `package-lock.json`:

```bash
npm ci
cp .env.example .env.local  # optional; add a real contact to NWS_USER_AGENT for the server-only NWS route
npm run dev
```

Open <http://localhost:3000>. The local page is development software, not a deployed emergency service. Before a change is ready for review, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Report the result of each command separately. Lint, typecheck, tests, and build do not establish agency source coverage or operational readiness.

## Plan and working agreements

- [Team start](docs/team-start.md): setup, small-change workflow, review gates, and proposed feature boundaries.
- [Source policy](docs/source-policy.md): source trust, coverage, freshness, location privacy, offline behavior, and reports.
- [Data contracts](docs/contracts.md): proposed and implemented schemas; check its status notes before claiming a route or UI integration exists.

The NWS point-alert adapter and route are the only implemented source integration, and are inactive without a real identifying contact; the browser currently displays official links instead of calling it. Other documents describe future work. Before showing a source in the app, verify its publisher, jurisdiction, update behavior, access terms, and geographic coverage. Never substitute a map view, neighborhood name, or empty feed response for an evacuation status.
