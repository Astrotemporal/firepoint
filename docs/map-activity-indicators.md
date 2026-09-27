# Map activity indicator display policy (draft)

This draft keeps the three public map circle meanings separate:

- **Grey** private sketch: on-device private mark halo only. It is not a report aggregate.
- **Yellow** crowdsourced report activity: a fixed-size hollow badge at a moderated aggregate coarse-cell centre. It means `published` unverified resident reports met the aggregation threshold. It is not a fire perimeter, evacuation order, geographic radius, or unique-people count.
- **Red** official active indicator: a fixed-size hollow badge only for an authoritative active incident or evacuation record with issuer, source URL, issued/updated/retrieved times, and geometry. Crowdsourced report count never selects red.

Current implementation status:

- `src/domain/crowd-report-activity-layer.ts` is pure data policy for yellow badges. It accepts only the public `ObservationAggregate` output from `src/domain/observation-aggregate.ts`.
- `src/domain/official-activity-indicator.ts` is pure data policy for red badges. It is unconnected because there is no reviewed live agency feed wired to the public UI in this branch.
- Neither policy calls a backend, reads private submissions, invents records, or plugs into routes.
- Pending or unconfirmed private submissions must stay off the public map.
- A stale, absent, withheld, or malformed input returns no badges.

Synthetic tests are the only visual/data proof in this draft. Do not use those fixtures as demo data.


Synthetic-only preview: `docs/preview/activity-indicators-synthetic.svg`.
