# Draft source-cache foundation

This draft adds a non-UI foundation for future verified shelter and evacuation
records in Postgres. It is not a resident-report backend and it does not change
public UI behavior.

## Added pieces

- `src/domain/source-cache.ts`: pure Zod contracts for source registry, fetch
  attempts, immutable generations, source records, provenance, and retractions.
- `src/server/source-cache-storage.ts`: a server-side storage interface only.
- `db/migrations/0100_source_snapshots.sql`: a uniquely named migration for the
  source cache.
- `src/domain/source-cache.test.ts`: synthetic fixtures only. No real upstream
  calls run in CI.

## Migration ordering

The migration is named `0100_source_snapshots.sql` on purpose. Draft PR #34 uses
an early `0001_community_observations.sql` name and is not a dependency here.
This migration has no foreign keys, views, or joins to community observation or
resident report tables.

Apply after any accepted base app migrations. It can be applied whether or not a
future community-report backend exists.

## Safety rules encoded in the draft

- Every stored row has a strict `tenant_id` and `jurisdiction_id`.
- Wildcard scopes such as `all`, `global`, and `*` are rejected.
- `empty_ok` is explicit and always means `not-all-clear`.
- Failed fetches carry failure kind, message, and retryability.
- Last-good generation identifiers are stored separately from failures.
- `source_generation` rows are immutable.
- Retraction is allowed only from a complete snapshot.
- Third-party evacuation polygons and style order are not stored.
- `production_auto_polling_enabled` is fixed `false`.

## Candidate-source notes and blockers

### FEMA OpenShelters

Candidate endpoint:

`https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0`

Manual 2026-09-27 note supplied for this draft: 0 Los Angeles County rows.
Coverage is incomplete. Per-record timestamps and storage/redistribution rights
remain unresolved. A zero-row response is not proof that shelters do not exist.

### LA County / Genasys public alert warning area

Candidate layer:

`Public_Emergency_Map_GENASYS_Alert_Warning_Area/FeatureServer/0`

Manual 2026-09-27 note supplied for this draft: 0 `GLN` rows. Issuer semantics,
retraction behavior, and Genasys polygon rights remain unresolved. Do not
persist, share, restyle, rank, or display those polygons until written approval
and positive-record validation exist.

### Glendale GIS MCP

Glendale GIS MCP is dated standing reference data, such as CAL FIRE/FEMA hazard
layers. It is not a live shelter, evacuation order, incident, or all-clear
source. If represented in this cache, use `standing-reference-snapshot` and keep
its vintage.

## Manual Preview probe gate

A manual Preview probe can be added only after all gates pass:

1. Written rights for storage and any redistribution are recorded.
2. Quotas, contact/user-agent rules, and acceptable use are documented.
3. Positive records validate the schema for the target jurisdiction.
4. Issuer and jurisdiction semantics are documented.
5. Retraction behavior from complete snapshots is documented.
6. Raw responses are stored only in an approved private operator location.
7. CI keeps using synthetic fixtures only.

If any gate fails, fail closed: mark `failed` or `skipped-gated`, keep the
previous last-good generation, do not retract from incomplete or failed data, and
link operators to the official source.

## Non-goals

No UI. No live adapter. No production poller. No secrets. No browser upstream
calls. No merge or deploy claim.
