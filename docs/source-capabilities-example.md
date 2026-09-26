# Source coverage and a real Glendale GIS example

**Status (research checked 26 September 2026):** the source adapters below exist in Firepoint, but the **production source panel and personalized POST queries are paused**. They do not establish current coverage, safety, an evacuation order, or a live map layer. This page uses a dated, publicly released GIS snapshot as a **real cited example**, not mock incident data. Recheck the publisher before any operational use.

| Information | Existing adapter | What it can and cannot mean |
| --- | --- | --- |
| NWS point-filtered weather alerts | `src/server/nws.ts`; `POST /api/v1/notices/query` | Actual publisher weather alerts if configured with a server-only identifying `NWS_USER_AGENT`. A red-flag/wind warning is **not** an evacuation order; an empty result is not an all-clear. Production query is paused. |
| CAL FIRE incidents | `src/server/calfire.ts` via `POST /api/v1/context/query` | Reported incident points and publisher estimates, **not** a fire front, route closure or exact local risk. The public GeoJSON endpoint is undocumented and may change. Paused. |
| NIFC/WFIGS perimeters | `src/server/nifc.ts` via context query | Mapped historical fire perimeters, with polygon capture time distinct from fetch time. Many incidents have no mapped perimeter; a polygon is not a spread forecast. Paused. |
| AirNow air quality | `src/server/airnow.ts` via context query | Preliminary reporting-area observations, **not** address-level exposure; needs server-only `AIRNOW_API_KEY`. Paused. |
| Glendale GIS MCP mapped hazards | `src/server/glendale-gis.ts`; `POST /api/v1/hazards/query` | Dated reference layers: wildfire hazard severity, FEMA flood zones, fault rupture, liquefaction, earthquake-induced landslide, dam inundation, and post-fire debris-flow assessment. These are **not** active disasters, official evacuation zones or current forecasts; hosted access needs a server-only key. Paused. |

**Not supported:** City/County active evacuation orders, verified standing evacuation-zone lookup, operational shelter openings, agency-published safe routes, public crowd reports, real-time earthquake incidents, WindNinja wind fields, fire spread/arrival projections or live/offline alert delivery. The merged homepage removed its default simulated fire in PR #16 but still routes to **unverified destinations** and treats private marks as hazard circles; neither is an operational source. PR #19 proposes to stop routing from marks and is not merged. See [source policy](source-policy.md) and [crowd-zone concept](crowd-report-zones.md).

## Reproducible published-data example, not a live incident

The [Glendale GIS MCP release `snapshot-20260926`](https://github.com/HackerFund/GlendaleGisMcp/releases/tag/snapshot-20260926) was built at **2026-09-26 02:33:13 UTC**. Its published [snapshot lock](https://github.com/HackerFund/GlendaleGisMcp/blob/main/snapshot.lock.json) specifies archive SHA-256 `8bf920799636f6d92977049488cf6bd550a82eed47f75a0aa4f561a0d9facf92` (and 5,852,228 bytes). The archive has 20 clipped snapshot layers; its **seven hazard layers** use a Glendale + ~2 km footprint. Download time and each agency map's vintage are separate clocks. This sample is a point-in-polygon check of the released GeoJSON at a **public downtown reference point** `[-118.2550, 34.1460]`, not a lookup of a resident's home:

| Layer / issuer | Snapshot observation at the public point | Publisher vintage vs retrieval |
| --- | --- | --- |
| CAL FIRE 2025 LRA Fire Hazard Severity Zones | Feature `OBJECTID 715`: `FHSZ_Description: "NonWildland"` (`FHSZ: -3`). This is an **unzoned mapped class**, not “safe from wildfire.” | Map named **2025 LRA**; source service last edit **2026-02-02 17:34 UTC**; snapshot fetched **2026-09-26 02:32 UTC**. Local adoption/legal status needs City review. |
| FEMA NFHL flood zones | `FLD_ZONE: "X"`, `ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD"`. This is the publisher's class, **not** a promise that flooding cannot occur. | Agency source last edit was **not supplied** in the snapshot; snapshot fetched **2026-09-26 02:32 UTC**. |
| CA DWR/DSOD dam inundation | No polygon matched this public point. That does **not** imply no inundation risk. | Layer titled **Oct 1, 2025**; source service last edit **2026-03-19 18:20 UTC**; snapshot fetched **2026-09-26 02:32 UTC**. |
| USGS post-fire debris-flow assessments | No clipped feature in this snapshot layer. This is **missing mapped coverage**, not no debris-flow hazard. | Agency last-edit time not supplied; snapshot fetched **2026-09-26 02:32 UTC**. |

The [MCP project's real-time-source rules](https://github.com/HackerFund/GlendaleGisMcp/blob/main/docs/real-time-sources.md#rules-for-using-real-time-data-in-an-app) explicitly say the MCP snapshot does **not** provide active fires or evacuation alerts. Its result needs agency layer URL, feature ID, map/source last-edit if known, snapshot build/fetch time, coverage and a caveat. A successful dated hazard lookup never becomes an evacuation or fire-spread claim. Do not embed this fixed example in the resident UI: it would go stale and could be mistaken for a current incident.
