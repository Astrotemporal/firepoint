# Community observation aggregation (contract only, not shipped)

**Status:** [`src/domain/observation-aggregate.ts`](../src/domain/observation-aggregate.ts) is a pure, Zod-backed contract with synthetic-only tests. Nothing imports it. There is **no** report submission route, report database, moderation queue, moderation owner, live aggregate endpoint, map layer, or routing hook. Until a named moderation owner, abuse policy, consent/retention/takedown path and source-rights review exist, this file is a decision gate, not a feature. Agency advisories and orders are a separate lane (`OfficialNoticeSchema`, issuer-sourced) and are **never** produced from resident input.

## What the aggregate is

One moderated `PublishedObservationSchema` list in; out come two separate objects: a public-shaped `ObservationAggregateSchema` and a **private** `AggregationAuditSchema` (`audience: "private-audit"`). Only the aggregate may ever be serialized outward; the audit holds report ids and per-id exclusion reasons, which can be joined back to raw reports, so it belongs in access-controlled storage or nowhere. The aggregate is a list of coarse cells keyed by **(cell, hazard kind, time bin)**, each carrying a capped count of moderated but unverified observations. Hazard kinds are the resident's claim topics: `fire`, `smoke`, `flooding`, `wind-damage`, `road-obstruction`, `utility`, `other`. A kind is what someone said they saw, not a confirmed event type.

| Step | Rule | Why |
| --- | --- | --- |
| Input gate | Only `kind: "community-observation"` with `verification: "unverified"` parses. Private `FireMark`s, raw submissions and official notices throw. | Marks are personal bookmarks; raw submissions have not been moderated; notices belong to their issuer. |
| Moderation gate | `moderation.status` must be `attested` (queue id, policy version, owner role, time). `missing` yields `state: "withheld", reason: "missing-moderation"` with full provenance and zero cells. | A count with no accountable reviewer is not publishable. Withheld is a first-class state, never an empty "published". |
| Space bin | `cellSizeDegrees` in [0.01, 1] (0.01 is ~1.1 km). `cellId = cell:<size>:<floor(lon/size)>:<floor(lat/size)>`; only whole-cell bounds are exported. | No exact point, no centroid, no polygon derived from reports. |
| Time bin | `timeBinSeconds` in [15 min, 24 h], epoch-aligned, on `observedAt ?? publishedAt`. `maxAgeSeconds` ≤ 7 days. | Old reports expire out; "recent" has a stated width. |
| Exclusions | Each dropped observation is listed with one reason: `no-public-point`, `precision-coarser-than-cell`, `outside-coverage`, `expired`, `future-dated`, `published-after-attestation`, `duplicate-id`. | Nothing is silently moved, snapped or repaired. |
| Threshold | Cells with fewer than `minReportsPerCell` (≥ 2) are withheld; only `withheldCellCount` is public, never where. | Coarse suppression of small cells. It reduces, and does not remove, re-identification risk; the value needs a per-deployment privacy review and says nothing about unique reporters. |
| Cap | `reportCount` saturates at `countCap`; `countBin` is `2-3`, `4-9`, `10+`. | Volume must not visually escalate authority. |
| Public provenance | `configVersion`, `algorithm`, full config, moderation attestation, `offeredObservationCount`, `countedObservationCount`, `exclusionCounts` per reason, earliest/latest observed and published times, `uniqueReporterDedupe: "not-possible"`. No ids, no digest. | Reproducible in shape without a join key; nobody can claim dedupe that did not happen. |
| Private audit | Separate object: sorted `inputObservationIds`, `excluded [{id, reason}]`, `withheldCellCount`, `configVersion`, `generatedAt`. The aggregate schema is `.strict()` and rejects these fields. | Ids of withheld or excluded reports would defeat suppression if published. If a future publisher needs an integrity proof, use a server-keyed HMAC over stored inputs, not a public hash of predictable ids. |
| Fixed wording | `caveats` are literal strings (uncertainty, abuse, privacy, not-all-clear). `usage` is literally `{ routingHazardInput: false, officialAuthority: false, boundaryOrModelEstimate: false }`. `allClear: false`. | A consumer cannot strip the caveats and still validate. |

Determinism: the same set of observations in any order produces the same aggregate and audit, so a stored aggregate can be re-derived and compared by a party that holds the inputs.

## What a count can and cannot say

A `reportCount` of 7 says: seven moderated observations with a public point inside this cell, of this kind, in this time bin, were published before the attestation. It does **not** say seven people, seven blocked roads, an active fire, a flooded street, or that neighbouring cells are safe. No reporter identity exists in `PublishedObservationSchema`, so one person filing seven times and seven people filing once are indistinguishable at this layer; the schema states this as `uniqueReporterDedupe: "not-possible"`. Anti-Sybil work (tokens, rate limits, accounts) belongs to the future submission service and would still not make counts official.

## The PR #11 anti-pattern, kept for contrast

Closed, unmerged [PR #11](https://github.com/Astrotemporal/firepoint/pull/11) turned three private map marks into an "estimated fire":

```ts
// PR #11 src/domain/triangulation.ts (not merged, do not revive)
/** Estimated fire extent from three marks on its edge: the one circle that passes through all three. */
export function estimateFire(marks: readonly LatLng[]): FireEstimate | null {
  if (marks.length !== 3) return null;
  // ... circumcircle through the three marks; returns center, radiusM, circumferenceM, ring
}
// fire-map.tsx then drew `fire-area` (filled), `fire-edge`, `fire-triangle`, `fire-center` layers.
```

Why it is unsafe, and how this contract differs:

1. **Geometry from opinion.** Three dragged pins on one phone are not three sightings of a fire edge. The circumcircle assumes the fire is a circle and that the pins lie exactly on it; near-collinear pins make the radius explode (the code only rejects `|d| < 1e-6`), so a small drag can swing an "estimate" across the city. Here, no geometry is derived from reports at all: cells are a fixed grid chosen by configuration.
2. **A filled area implies a safe exterior.** A shaded circle with a centre dot reads as "the fire is here and not there." Cells here carry `notAllClear` wording, `withheld` states, and no fill semantics; an absent cell is unknown.
3. **Same colour as a real perimeter.** The overlay used fire styling indistinguishable from a published NIFC/WFIGS polygon. This aggregate is a separate `kind` with `verification: "unverified"` and `officialAuthority: false`, so a map layer (if ever built) must use a distinct legend.
4. **No provenance.** The estimate had no time, no source, no count, no configuration. Every aggregate here carries its config version, input and exclusion counts, source times and moderation attestation; ids stay in the private audit.
5. **Straight into routing.** On `main`, private marks already become 500 m routing hazards (`src/evacuation/marks.ts`). PR #11 would have made a user-drawn circle steer escape routes. This contract sets `routingHazardInput: false` and the aggregate cannot be parsed as an evacuation `Hazard`.
6. **Concentric rings.** Red/yellow evacuation circles around an estimate (a "battle-royale ring") would invent zones no agency issued. Not added; `EvacuationZoneSchema` stays `unavailable` until a verified standing-zone source exists.

## Limitations and open decisions

- No moderation owner exists. Until one is named, the only valid output is `withheld` / `missing-moderation`, and the function should not run in any served route.
- Cell bounds are exported (coarse, ≥ ~1.1 km) and `minReportsPerCell` is a suppression rule, not a proof of anonymity or of distinct reporters. A privacy review must set both per deployment; then change the config and bump `configVersion`, do not special-case cells.
- The audit object must never reach a UI, public route, log line, or analytics event. A publisher that cannot store it under access control should discard it.
- Observations with `precisionMeters` coarser than the cell are excluded rather than smeared across cells. A future version could spread them; that is a documented change, not a silent one.
- Time bins use the resident's `observedAt` when given. A resident can misstate it; moderation may reject such reports, but the aggregator cannot tell.
- There is no public digest. A hash over predictable ids is neither privacy-preserving nor an integrity proof; a durable service should store the observation set and, if needed, sign with a server-held key.
- The topic list on `PublishedObservationSchema` gained `fire` and `wind-damage`. The list is a vocabulary for claims and does not imply a source, adapter, or agency category.
