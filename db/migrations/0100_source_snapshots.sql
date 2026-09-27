-- Draft authoritative source-cache foundation.
--
-- Ordering: intentionally numbered 0100 so it does not collide with draft PR #34
-- community_observations migration names. This migration has no foreign keys,
-- views, or joins to resident/community report tables.
--
-- Safety invariants:
-- - tenant_id and jurisdiction_id are required; wildcard scopes are rejected.
-- - empty_ok always means not-all-clear.
-- - production auto polling is fixed false in this draft.
-- - generations are immutable.
-- - retractions are allowed only from complete snapshots.
-- - evacuation polygons/style order are not stored before rights approval.

CREATE TABLE IF NOT EXISTS source_registry (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  source_key text NOT NULL CHECK (source_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  registry_class text NOT NULL CHECK (registry_class IN ('official-live-candidate', 'standing-reference-snapshot')),
  display_name text NOT NULL,
  issuer text NOT NULL,
  source_url text NOT NULL CHECK (source_url LIKE 'https://%'),
  record_kinds text[] NOT NULL CHECK (cardinality(record_kinds) > 0),
  coverage_status text NOT NULL CHECK (coverage_status IN ('unverified', 'incomplete', 'validated-partial', 'validated-complete-for-scope')),
  rights_status text NOT NULL CHECK (rights_status IN ('unresolved', 'preview-only', 'storage-approved', 'redistribution-approved')),
  empty_ok boolean NOT NULL DEFAULT false,
  empty_result_meaning text NOT NULL DEFAULT 'not-all-clear' CHECK (empty_result_meaning = 'not-all-clear'),
  production_auto_polling_enabled boolean NOT NULL DEFAULT false CHECK (production_auto_polling_enabled = false),
  notes text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT source_registry_tenant_strict CHECK (
    tenant_id ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    AND tenant_id NOT IN ('*', 'all', 'global', 'public', 'default', 'none')
  ),
  CONSTRAINT source_registry_jurisdiction_strict CHECK (
    jurisdiction_id ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    AND jurisdiction_id LIKE '%.%'
    AND jurisdiction_id NOT IN ('*', 'all', 'global', 'public', 'default', 'none')
  ),
  CONSTRAINT source_registry_kinds_allowed CHECK (
    record_kinds <@ ARRAY['shelter-status', 'evacuation-order', 'evacuation-warning', 'evacuation-advisory', 'standing-reference']::text[]
  ),
  UNIQUE (tenant_id, jurisdiction_id, source_key),
  UNIQUE (id, tenant_id, jurisdiction_id)
);

CREATE TABLE IF NOT EXISTS source_fetch_attempt (
  id uuid PRIMARY KEY,
  source_registry_id uuid NOT NULL,
  tenant_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'succeeded-non-empty', 'succeeded-empty', 'failed', 'skipped-gated')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  upstream_request_url text CHECK (upstream_request_url IS NULL OR upstream_request_url LIKE 'https://%'),
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  rows_seen integer NOT NULL DEFAULT 0 CHECK (rows_seen >= 0),
  rows_accepted integer NOT NULL DEFAULT 0 CHECK (rows_accepted >= 0),
  complete_snapshot boolean NOT NULL DEFAULT false,
  empty_ok boolean NOT NULL DEFAULT false,
  last_good_generation_id uuid,
  failure_kind text CHECK (failure_kind IS NULL OR failure_kind IN ('network', 'http', 'schema', 'rights', 'quota', 'coverage', 'unknown')),
  failure_message text,
  failure_retryable boolean,
  CONSTRAINT source_fetch_rows CHECK (rows_accepted <= rows_seen),
  CONSTRAINT source_fetch_empty_requires_opt_in CHECK (status <> 'succeeded-empty' OR empty_ok = true),
  CONSTRAINT source_fetch_failure_shape CHECK (
    (status = 'failed' AND failure_kind IS NOT NULL AND failure_message IS NOT NULL AND failure_retryable IS NOT NULL)
    OR (status <> 'failed' AND failure_kind IS NULL AND failure_message IS NULL AND failure_retryable IS NULL)
  ),
  UNIQUE (id, source_registry_id, tenant_id, jurisdiction_id),
  FOREIGN KEY (source_registry_id, tenant_id, jurisdiction_id)
    REFERENCES source_registry (id, tenant_id, jurisdiction_id)
);

CREATE TABLE IF NOT EXISTS source_generation (
  id uuid PRIMARY KEY,
  source_registry_id uuid NOT NULL,
  fetch_attempt_id uuid NOT NULL,
  tenant_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  generation_number integer NOT NULL CHECK (generation_number > 0),
  issuer text NOT NULL,
  source_url text NOT NULL CHECK (source_url LIKE 'https://%'),
  source_vintage text NOT NULL,
  source_issued_at timestamptz,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz,
  record_count integer NOT NULL CHECK (record_count >= 0),
  complete_snapshot boolean NOT NULL,
  empty_result_meaning text NOT NULL DEFAULT 'not-all-clear' CHECK (empty_result_meaning = 'not-all-clear'),
  previous_complete_generation_id uuid REFERENCES source_generation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT source_generation_expiry CHECK (expires_at IS NULL OR expires_at > fetched_at),
  UNIQUE (source_registry_id, generation_number),
  UNIQUE (id, tenant_id, jurisdiction_id),
  UNIQUE (id, source_registry_id, tenant_id, jurisdiction_id),
  FOREIGN KEY (source_registry_id, tenant_id, jurisdiction_id)
    REFERENCES source_registry (id, tenant_id, jurisdiction_id),
  FOREIGN KEY (fetch_attempt_id, source_registry_id, tenant_id, jurisdiction_id)
    REFERENCES source_fetch_attempt (id, source_registry_id, tenant_id, jurisdiction_id)
);

CREATE TABLE IF NOT EXISTS source_record (
  id uuid PRIMARY KEY,
  source_registry_id uuid NOT NULL,
  generation_id uuid NOT NULL,
  tenant_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  upstream_record_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('shelter-status', 'evacuation-order', 'evacuation-warning', 'evacuation-advisory', 'standing-reference')),
  status text NOT NULL CHECK (status IN ('current', 'superseded', 'retracted')),
  name text NOT NULL,
  description text,
  location_text text,
  point_longitude double precision CHECK (point_longitude IS NULL OR point_longitude BETWEEN -180 AND 180),
  point_latitude double precision CHECK (point_latitude IS NULL OR point_latitude BETWEEN -90 AND 90),
  provenance_issuer text NOT NULL,
  provenance_source_url text NOT NULL CHECK (provenance_source_url LIKE 'https://%'),
  provenance_source_vintage text NOT NULL,
  provenance_source_issued_at timestamptz,
  provenance_fetched_at timestamptz NOT NULL,
  provenance_expires_at timestamptz,
  provenance_complete_snapshot boolean NOT NULL,
  provenance_last_good_generation_id uuid,
  provenance_fetch_failure_kind text CHECK (provenance_fetch_failure_kind IS NULL OR provenance_fetch_failure_kind IN ('network', 'http', 'schema', 'rights', 'quota', 'coverage', 'unknown')),
  provenance_fetch_failure_message text,
  provenance_fetch_failure_retryable boolean,
  retracted_by_generation_id uuid REFERENCES source_generation (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT source_record_retraction_shape CHECK (
    (status = 'retracted' AND retracted_by_generation_id IS NOT NULL)
    OR (status <> 'retracted' AND retracted_by_generation_id IS NULL)
  ),
  UNIQUE (generation_id, upstream_record_id),
  FOREIGN KEY (source_registry_id, tenant_id, jurisdiction_id)
    REFERENCES source_registry (id, tenant_id, jurisdiction_id),
  FOREIGN KEY (generation_id, source_registry_id, tenant_id, jurisdiction_id)
    REFERENCES source_generation (id, source_registry_id, tenant_id, jurisdiction_id)
);

CREATE INDEX IF NOT EXISTS source_registry_scope_idx ON source_registry (tenant_id, jurisdiction_id, registry_class);
CREATE INDEX IF NOT EXISTS source_fetch_attempt_source_started_idx ON source_fetch_attempt (source_registry_id, started_at DESC);
CREATE INDEX IF NOT EXISTS source_generation_source_created_idx ON source_generation (source_registry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS source_record_current_idx ON source_record (tenant_id, jurisdiction_id, source_registry_id, status);

CREATE OR REPLACE FUNCTION prevent_source_generation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'source_generation rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS source_generation_no_update ON source_generation;
CREATE TRIGGER source_generation_no_update BEFORE UPDATE ON source_generation
  FOR EACH ROW EXECUTE FUNCTION prevent_source_generation_mutation();

DROP TRIGGER IF EXISTS source_generation_no_delete ON source_generation;
CREATE TRIGGER source_generation_no_delete BEFORE DELETE ON source_generation
  FOR EACH ROW EXECUTE FUNCTION prevent_source_generation_mutation();

CREATE OR REPLACE FUNCTION require_complete_snapshot_for_retraction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  retracting source_generation%ROWTYPE;
BEGIN
  IF NEW.retracted_by_generation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO retracting FROM source_generation WHERE id = NEW.retracted_by_generation_id;
  IF NOT FOUND OR retracting.complete_snapshot IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'source records may be retracted only by a complete snapshot generation';
  END IF;
  IF retracting.source_registry_id <> NEW.source_registry_id
     OR retracting.tenant_id <> NEW.tenant_id
     OR retracting.jurisdiction_id <> NEW.jurisdiction_id THEN
    RAISE EXCEPTION 'retracting generation scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS source_record_retraction_complete_snapshot ON source_record;
CREATE TRIGGER source_record_retraction_complete_snapshot
  BEFORE INSERT OR UPDATE OF retracted_by_generation_id, status ON source_record
  FOR EACH ROW EXECUTE FUNCTION require_complete_snapshot_for_retraction();
