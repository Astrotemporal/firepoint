# Source and safety policy

This policy governs proposed Firepoint features and follows the [Glendale GIS MCP real-time-source rules](https://github.com/HackerFund/GlendaleGisMcp/blob/main/docs/real-time-sources.md#rules-for-using-real-time-data-in-an-app). **No operational coverage guarantee or authoritative evacuation status is provided by this repository.** Any new adapter must pass the release gates below before its output can be presented as current. Firepoint is independent of the City of Glendale and all other public agencies. It is not an emergency notification system or an all-clear authority.

## Keep four information lanes apart

| Lane | What it may say | Required handling |
| --- | --- | --- |
| Official agency notices | A notice actually published by an identified agency for a verified jurisdiction and area | Cite the issuing agency and direct URL; show issue/update time (when supplied), last successful check, coverage, and freshness. Link to the original. Never create, downgrade, or override a notice. |
| Standing hazard/reference maps | Mapped long-term hazards or resources at a documented snapshot date | Name publisher, layer, geometry coverage, vintage, and limitations. Do not label as a live incident, evacuation notice, or personalized safety verdict. |
| Community reports | A person's claim, if reporting is later built | Label unverified and separate from official symbols and filters. Moderation, abuse response, consent, rate limits, audit, deletion, retention, and location privacy must work before public launch. Votes do not turn claims into official facts. |
| Personal offline prep | A person's selected area, checklist, or private draft | Save only after explicit action; provide deletion and shared-device guidance. Cached source data is last-synced information, not live status. |

## Before adding an external source

For every feed, page, or map layer, record its publisher and official URL, jurisdiction, geographic coverage, data meaning, issue/update fields, polling behavior, license/reuse and attribution rules, failure behavior, and an owner who will review changes. Verify these with the publisher's documentation or direct agency material; a plausible title or available endpoint is not enough. Candidate agency sources require separate review before use. Display basemaps are for orientation, not analysis boundaries.

Keep the original timestamp if provided, the time of our successful retrieval, source link, and coverage with each result. An evacuation notice must show the issuing agency's message **word for word** and link to its original record; Firepoint must not republish it as our own order. Every notice needs a stable `sourceKey` tied to its source-health check before mixed feeds reach the UI. Validate external payloads at the server boundary; handle schema changes and partial results as errors, not reassuring defaults. Set source-specific freshness and expiry rules **before** calling data current. Respect the publisher's update cadence; use a bounded server-side source cache and descriptive User-Agent/contact where required. A personalized response may be `no-store` while the public upstream response is cached separately. Do not enable repeated live UI queries until rate limits, source rights and operational monitoring are in place. If a publisher offers no usable update signal, say that plainly rather than manufacturing a timestamp. Show times with an explicit timezone (for local display, use America/Los_Angeles) and distinguish "issued" from "checked."

Treat these states separately: a matching notice, no match **within verified coverage**, no usable feed data, stale last-known data, outside coverage, and fetch/validation error. No match is never proof of safety. An empty response, failed request, expired cache, or loss of connectivity must never become "no evacuation" or "all clear." When freshness or coverage cannot be established, show unavailable/unknown and link to the agency source. Do not promise continuous monitoring unless it is actually operated and measured.

## Geography and permissions

A person's selected place and a published agency boundary may have different precision. Use validated source geometry to decide whether a layer covers a place; do not use a display camera center, rough address guess, or neighborhood label for official zone membership. A tentative Glenoaks Canyon pilot is a neighborhood/reference scope only, **not an evacuation zone**. A route calculated by an external navigation app is not checked against fire, closures or current orders. Only an agency-published route/destination may be cited as such; send a public destination (not the user's origin) in any user-initiated navigation handoff. No official evacuation-zone polygon or lookup for it is established by this repository. Do not manufacture one.

Request device location only with clear purpose and consent, and always offer manual area selection. Minimize precision, storage, retention, and sharing. Do not collect location history by default. Protect any report location and identifying details before public display. Review source licenses and attribution before caching, redistributing, or bundling data.

## Offline and release gate

An offline app shell or saved checklist can remain useful, but network maps and notices may fail offline. Label any cached notice with its last successful sync and original issue/update time; warn when it is expired or freshness is unknown. Never show a cached notice as live. If no cached source is usable, show a clear unavailable state and previously verified official links where possible. Avoid suggesting that opening a link will work without connectivity.

Before release of any source-backed feature, test stale feeds, empty responses, out-of-coverage places, missing timestamps, changed schemas, offline mode, and conflicting records. Check that the UI never says "safe" or implies an all-clear from absence of data. Get explicit review of source rights, privacy, and incident wording. Public reports require a staffed moderation and escalation plan, not just a form or database table.

## Glendale GIS MCP source limits

The hackathon-provided [Glendale GIS MCP server](https://github.com/HackerFund/GlendaleGisMcp) can help inspect sourced hazard and City reference/resource datasets. Its published snapshot and upstream layer dates are not live incident times. Verify layer-specific vintage, coverage, and agency terms before use in the app; keep those dates distinct from our fetch/check time. The City's `neighborhood_zones` are neighborhood reference data, **not evacuation zones**. A tentative Glenoaks Canyon neighborhood pilot supplies no official evacuation-zone membership. A hosted MCP bearer key must remain on the server; a local stdio MCP developer connection is not a browser integration. Upstream server code is GPL-3.0-or-later, while public-agency dataset reuse and attribution rules are separate and must be checked independently. See [setup](team-start.md#hackathon-gis-setup-optional-developer-tool-not-app-integration) and the [workshop resource list](https://www.visioncityhack.app/workshops/#resources).
