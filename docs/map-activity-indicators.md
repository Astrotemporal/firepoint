# Map activity indicator display policy (draft)

This draft keeps the three public map circle meanings separate:

- **Grey** private sketch: on-device private mark halo only. It is not a report aggregate.
- **Yellow** crowdsourced report activity: a fixed-size hollow badge at a coarse-cell centre. Two draft inputs are separate: (1) moderated `ObservationAggregate` cells already reviewed for publication, and (2) server-produced `unreviewed-report-activity` coarse-cell/time counts with `reportCount >= 3`, `verification: unreviewed`, and `uniqueReporterDedupe: not-possible`. Yellow is not a fire perimeter, evacuation order, geographic radius, or unique-people count.
- **Red** official active indicator: a fixed-size hollow badge only for an authoritative active incident or evacuation record with issuer, source URL, issued/updated/retrieved times, and geometry. Crowdsourced report count never selects red.

Current implementation status:

- `src/domain/crowd-report-activity-layer.ts` is pure data policy for yellow badges. It keeps two inputs separate: the existing moderated public `ObservationAggregate`, and a new strict `unreviewed-report-activity` input for server-produced 3+ coarse-cell counts. The unreviewed path labels badges exactly: “3+ unreviewed reports — may be repeats, not a confirmed hazard”.
- `src/domain/official-activity-indicator.ts` is pure data policy for red badges. It is unconnected because there is no reviewed live agency feed wired to the public UI in this branch.
- Neither policy calls a backend, reads private submissions, auto-uploads private marks, invents records, or plugs into routes.
- Pending or unconfirmed private submissions must stay off the public map unless a separate backend has consent, rights, abuse controls, retention policy, and emits only the coarse `unreviewed-report-activity` contract. Private grey marks never auto-change into public yellow.
- A stale, absent, withheld, or malformed input returns no badges.

Synthetic tests are the only visual/data proof in this draft. Do not use those fixtures as demo data.


Synthetic-only preview: `docs/preview/activity-indicators-synthetic.svg`.
