-- Draft only: do not apply before Postgres integration tests and source-rights review.
-- Applied after 0100_source_snapshots.sql; no community tables are referenced.
BEGIN;

-- This proposal cannot safely reinterpret legacy rows. A deployment with any
-- previous source attempts/generations/records needs a separate audited backfill.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM source_fetch_attempt) OR
     EXISTS (SELECT 1 FROM source_generation) OR
     EXISTS (SELECT 1 FROM source_record) THEN
    RAISE EXCEPTION '0101 requires empty source attempt/generation/record tables; audit legacy rows first';
  END IF;
  IF EXISTS (SELECT 1 FROM source_registry WHERE issuer = '' OR issuer <> btrim(issuer)) THEN
    RAISE EXCEPTION '0101 requires exact, nonblank source issuer labels';
  END IF;
END;
$$;

-- An issuer label is an authority boundary, not an editable display field.
CREATE OR REPLACE FUNCTION source_registry_issuer_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.issuer IS DISTINCT FROM OLD.issuer OR
     NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.jurisdiction_id IS DISTINCT FROM OLD.jurisdiction_id THEN
    RAISE EXCEPTION 'source registry issuer/scope is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER source_registry_issuer_scope_immutable
  BEFORE UPDATE ON source_registry FOR EACH ROW EXECUTE FUNCTION source_registry_issuer_immutable();

ALTER TABLE source_registry ADD CONSTRAINT source_registry_issuer_scope_key
  UNIQUE (id, tenant_id, jurisdiction_id, issuer);
ALTER TABLE source_generation ADD CONSTRAINT source_generation_one_fetch_key
  UNIQUE (fetch_attempt_id);
ALTER TABLE source_generation ADD CONSTRAINT source_generation_complete_scope_key
  UNIQUE (id, source_registry_id, tenant_id, jurisdiction_id, complete_snapshot);
ALTER TABLE source_generation ADD CONSTRAINT source_generation_issuer_scope_key
  UNIQUE (id, source_registry_id, tenant_id, jurisdiction_id, issuer);
ALTER TABLE source_generation ADD CONSTRAINT source_generation_issuer_scope_fk
  FOREIGN KEY (source_registry_id, tenant_id, jurisdiction_id, issuer)
  REFERENCES source_registry (id, tenant_id, jurisdiction_id, issuer);
ALTER TABLE source_record ADD CONSTRAINT source_record_provenance_issuer_fk
  FOREIGN KEY (generation_id, source_registry_id, tenant_id, jurisdiction_id, provenance_issuer)
  REFERENCES source_generation (id, source_registry_id, tenant_id, jurisdiction_id, issuer);

-- Constant true witness plus a composite FK rejects incomplete or foreign-source
-- pointers, even if an application submits forged UUIDs or omits its own checks.
ALTER TABLE source_fetch_attempt ADD COLUMN last_good_complete boolean NOT NULL DEFAULT true
  CHECK (last_good_complete = true);
ALTER TABLE source_fetch_attempt ADD CONSTRAINT source_fetch_last_good_complete_fk
  FOREIGN KEY (last_good_generation_id, source_registry_id, tenant_id, jurisdiction_id, last_good_complete)
  REFERENCES source_generation (id, source_registry_id, tenant_id, jurisdiction_id, complete_snapshot);
ALTER TABLE source_generation ADD COLUMN previous_complete_witness boolean NOT NULL DEFAULT true
  CHECK (previous_complete_witness = true);
ALTER TABLE source_generation ADD CONSTRAINT source_generation_previous_complete_fk
  FOREIGN KEY (previous_complete_generation_id, source_registry_id, tenant_id, jurisdiction_id, previous_complete_witness)
  REFERENCES source_generation (id, source_registry_id, tenant_id, jurisdiction_id, complete_snapshot);
ALTER TABLE source_record ADD COLUMN provenance_last_good_complete boolean NOT NULL DEFAULT true
  CHECK (provenance_last_good_complete = true);
ALTER TABLE source_record ADD CONSTRAINT source_record_provenance_last_good_complete_fk
  FOREIGN KEY (provenance_last_good_generation_id, source_registry_id, tenant_id, jurisdiction_id, provenance_last_good_complete)
  REFERENCES source_generation (id, source_registry_id, tenant_id, jurisdiction_id, complete_snapshot);
ALTER TABLE source_record ADD COLUMN retracting_complete_witness boolean NOT NULL DEFAULT true
  CHECK (retracting_complete_witness = true);
ALTER TABLE source_record ADD CONSTRAINT source_record_retracting_complete_fk
  FOREIGN KEY (retracted_by_generation_id, source_registry_id, tenant_id, jurisdiction_id, retracting_complete_witness)
  REFERENCES source_generation (id, source_registry_id, tenant_id, jurisdiction_id, complete_snapshot);

-- A last-good value records the latest completed snapshot at fetch start.
-- Failure/skip never advances it. Serialize new attempts against generation
-- insertion on the source registry row to avoid a concurrent stale pointer.
CREATE OR REPLACE FUNCTION source_fetch_attempt_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  latest_id uuid;
  latest_fetched_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM source_registry
      WHERE id = NEW.source_registry_id AND tenant_id = NEW.tenant_id
        AND jurisdiction_id = NEW.jurisdiction_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'source registry scope mismatch'; END IF;
    SELECT id, fetched_at INTO latest_id, latest_fetched_at FROM source_generation
      WHERE source_registry_id = NEW.source_registry_id AND tenant_id = NEW.tenant_id
        AND jurisdiction_id = NEW.jurisdiction_id AND complete_snapshot = true
      ORDER BY generation_number DESC LIMIT 1;
    IF NEW.status <> 'started' OR NEW.completed_at IS NOT NULL OR
       NEW.last_good_generation_id IS DISTINCT FROM latest_id OR
       (latest_id IS NOT NULL AND latest_fetched_at > NEW.started_at) OR
       NEW.complete_snapshot OR NEW.rows_seen <> 0 OR NEW.rows_accepted <> 0 OR NEW.failure_kind IS NOT NULL THEN
      RAISE EXCEPTION 'invalid initial source fetch attempt';
    END IF;
  ELSE
    IF OLD.status <> 'started' OR NEW.status = 'started' OR
       NEW.id IS DISTINCT FROM OLD.id OR NEW.source_registry_id IS DISTINCT FROM OLD.source_registry_id OR
       NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.jurisdiction_id IS DISTINCT FROM OLD.jurisdiction_id OR
       NEW.started_at IS DISTINCT FROM OLD.started_at OR
       NEW.last_good_generation_id IS DISTINCT FROM OLD.last_good_generation_id THEN
      RAISE EXCEPTION 'invalid source fetch attempt transition';
    END IF;
    IF NEW.completed_at IS NULL OR NEW.completed_at < NEW.started_at OR
       (NEW.status = 'succeeded-empty' AND NEW.rows_accepted <> 0) OR
       (NEW.status = 'succeeded-non-empty' AND NEW.rows_accepted = 0) OR
       (NEW.status IN ('failed', 'skipped-gated') AND NEW.complete_snapshot) THEN
      RAISE EXCEPTION 'invalid source fetch attempt result';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER source_fetch_attempt_guard_trigger
  BEFORE INSERT OR UPDATE ON source_fetch_attempt
  FOR EACH ROW EXECUTE FUNCTION source_fetch_attempt_guard();

-- Generation can only record a successful fetch whose accepted count and
-- completeness agree; previously completed generation must precede this one.
CREATE OR REPLACE FUNCTION source_generation_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  attempt_row source_fetch_attempt%ROWTYPE;
  registry source_registry%ROWTYPE;
  previous_generation source_generation%ROWTYPE;
  latest_complete_id uuid;
  latest_number integer;
BEGIN
  SELECT * INTO registry FROM source_registry WHERE id = NEW.source_registry_id
    AND tenant_id = NEW.tenant_id AND jurisdiction_id = NEW.jurisdiction_id FOR UPDATE;
  IF NOT FOUND OR NEW.issuer IS DISTINCT FROM registry.issuer OR
     registry.rights_status NOT IN ('storage-approved', 'redistribution-approved') THEN
    RAISE EXCEPTION 'source issuer/scope or storage rights not approved';
  END IF;
  SELECT * INTO attempt_row FROM source_fetch_attempt WHERE id = NEW.fetch_attempt_id
    AND source_registry_id = NEW.source_registry_id AND tenant_id = NEW.tenant_id
    AND jurisdiction_id = NEW.jurisdiction_id FOR UPDATE;
  IF NOT FOUND OR attempt_row.status NOT IN ('succeeded-empty', 'succeeded-non-empty') OR
     attempt_row.complete_snapshot IS DISTINCT FROM NEW.complete_snapshot OR
     attempt_row.rows_accepted IS DISTINCT FROM NEW.record_count OR
     (attempt_row.status = 'succeeded-empty' AND NEW.record_count <> 0) OR
     (attempt_row.status = 'succeeded-non-empty' AND NEW.record_count = 0) THEN
    RAISE EXCEPTION 'generation does not match a successful fetch';
  END IF;
  -- The source registry row lock serializes overlapping successful attempts.
  -- A fetch started before a competing complete generation must retry, never
  -- fork stale last-good lineage or claim an older generation number.
  SELECT id INTO latest_complete_id FROM source_generation
    WHERE source_registry_id = NEW.source_registry_id AND tenant_id = NEW.tenant_id
      AND jurisdiction_id = NEW.jurisdiction_id AND complete_snapshot = true
    ORDER BY generation_number DESC LIMIT 1;
  SELECT max(generation_number) INTO latest_number FROM source_generation
    WHERE source_registry_id = NEW.source_registry_id AND tenant_id = NEW.tenant_id
      AND jurisdiction_id = NEW.jurisdiction_id;
  IF attempt_row.last_good_generation_id IS DISTINCT FROM latest_complete_id OR
     NEW.generation_number <> coalesce(latest_number, 0) + 1 THEN
    RAISE EXCEPTION 'stale or forked source generation';
  END IF;
  IF NEW.previous_complete_generation_id IS DISTINCT FROM attempt_row.last_good_generation_id THEN
    RAISE EXCEPTION 'previous complete generation differs from fetch last-good';
  END IF;
  IF NEW.previous_complete_generation_id IS NOT NULL THEN
    SELECT * INTO previous_generation FROM source_generation
      WHERE id = NEW.previous_complete_generation_id AND source_registry_id = NEW.source_registry_id
        AND tenant_id = NEW.tenant_id AND jurisdiction_id = NEW.jurisdiction_id AND complete_snapshot
      FOR KEY SHARE;
    IF NOT FOUND OR previous_generation.generation_number >= NEW.generation_number THEN
      RAISE EXCEPTION 'previous complete generation must precede generation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER source_generation_guard_trigger BEFORE INSERT ON source_generation
  FOR EACH ROW EXECUTE FUNCTION source_generation_guard();

-- A row cannot be marked missing when the retracting complete snapshot contains it.
CREATE OR REPLACE FUNCTION source_record_retraction_absence_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  latest_complete_id uuid;
  retracting_number integer;
  record_number integer;
BEGIN
  IF NEW.retracted_by_generation_id IS NOT NULL THEN
    -- Same lock used by generation insertion: no retroactive retraction if
    -- another complete generation was committed while this request waited.
    PERFORM 1 FROM source_registry WHERE id = NEW.source_registry_id
      AND tenant_id = NEW.tenant_id AND jurisdiction_id = NEW.jurisdiction_id FOR UPDATE;
    SELECT id INTO latest_complete_id FROM source_generation
      WHERE source_registry_id = NEW.source_registry_id AND tenant_id = NEW.tenant_id
        AND jurisdiction_id = NEW.jurisdiction_id AND complete_snapshot = true
      ORDER BY generation_number DESC LIMIT 1;
    SELECT generation_number INTO retracting_number FROM source_generation
      WHERE id = NEW.retracted_by_generation_id AND source_registry_id = NEW.source_registry_id
        AND tenant_id = NEW.tenant_id AND jurisdiction_id = NEW.jurisdiction_id AND complete_snapshot = true;
    SELECT generation_number INTO record_number FROM source_generation
      WHERE id = NEW.generation_id AND source_registry_id = NEW.source_registry_id
        AND tenant_id = NEW.tenant_id AND jurisdiction_id = NEW.jurisdiction_id;
    IF NEW.retracted_by_generation_id IS DISTINCT FROM latest_complete_id OR
       retracting_number IS NULL OR record_number IS NULL OR retracting_number <= record_number THEN
      RAISE EXCEPTION 'retraction requires latest later complete source generation';
    END IF;
  END IF;
  -- Serialize record insertion and retraction against the same complete
  -- generation; otherwise two concurrent transactions could both see absence.
  PERFORM 1 FROM source_generation
    WHERE id = COALESCE(NEW.retracted_by_generation_id, NEW.generation_id) FOR UPDATE;
  IF NEW.retracted_by_generation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM source_record present
    WHERE present.generation_id = NEW.retracted_by_generation_id
      AND present.source_registry_id = NEW.source_registry_id
      AND present.tenant_id = NEW.tenant_id AND present.jurisdiction_id = NEW.jurisdiction_id
      AND present.upstream_record_id = NEW.upstream_record_id
  ) THEN
    RAISE EXCEPTION 'record present in retracting generation';
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM source_record prior
    WHERE prior.retracted_by_generation_id = NEW.generation_id
      AND prior.source_registry_id = NEW.source_registry_id
      AND prior.tenant_id = NEW.tenant_id AND prior.jurisdiction_id = NEW.jurisdiction_id
      AND prior.upstream_record_id = NEW.upstream_record_id
  ) THEN
    RAISE EXCEPTION 'retracting generation already claimed missing record';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER source_record_retraction_absence_guard_trigger
  BEFORE INSERT OR UPDATE ON source_record FOR EACH ROW
  EXECUTE FUNCTION source_record_retraction_absence_guard();

-- Record payload/provenance is immutable; only lifecycle status may change.
CREATE OR REPLACE FUNCTION source_record_payload_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent source_generation%ROWTYPE;
  registry source_registry%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.source_registry_id IS DISTINCT FROM OLD.source_registry_id OR
    NEW.generation_id IS DISTINCT FROM OLD.generation_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
    NEW.jurisdiction_id IS DISTINCT FROM OLD.jurisdiction_id OR
    NEW.upstream_record_id IS DISTINCT FROM OLD.upstream_record_id OR NEW.kind IS DISTINCT FROM OLD.kind OR
    NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description OR
    NEW.location_text IS DISTINCT FROM OLD.location_text OR
    NEW.point_longitude IS DISTINCT FROM OLD.point_longitude OR NEW.point_latitude IS DISTINCT FROM OLD.point_latitude OR
    NEW.provenance_issuer IS DISTINCT FROM OLD.provenance_issuer OR
    NEW.provenance_source_url IS DISTINCT FROM OLD.provenance_source_url OR
    NEW.provenance_source_vintage IS DISTINCT FROM OLD.provenance_source_vintage OR
    NEW.provenance_source_issued_at IS DISTINCT FROM OLD.provenance_source_issued_at OR
    NEW.provenance_fetched_at IS DISTINCT FROM OLD.provenance_fetched_at OR
    NEW.provenance_expires_at IS DISTINCT FROM OLD.provenance_expires_at OR
    NEW.provenance_complete_snapshot IS DISTINCT FROM OLD.provenance_complete_snapshot OR
    NEW.provenance_last_good_generation_id IS DISTINCT FROM OLD.provenance_last_good_generation_id OR
    NEW.provenance_fetch_failure_kind IS DISTINCT FROM OLD.provenance_fetch_failure_kind OR
    NEW.provenance_fetch_failure_message IS DISTINCT FROM OLD.provenance_fetch_failure_message OR
    NEW.provenance_fetch_failure_retryable IS DISTINCT FROM OLD.provenance_fetch_failure_retryable OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'source record payload/provenance is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.status = 'retracted' OR
    (OLD.status = 'superseded' AND NEW.status = 'current') OR
    (OLD.status = 'current' AND NEW.status = 'retracted' AND NEW.retracted_by_generation_id IS NULL) OR
    (OLD.status = 'superseded' AND NEW.status = 'retracted' AND NEW.retracted_by_generation_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'source record lifecycle cannot go backwards';
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.status <> 'current' OR NEW.retracted_by_generation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'new source records must start current';
  END IF;
  SELECT * INTO parent FROM source_generation WHERE id = NEW.generation_id
    AND source_registry_id = NEW.source_registry_id AND tenant_id = NEW.tenant_id
    AND jurisdiction_id = NEW.jurisdiction_id;
  SELECT * INTO registry FROM source_registry WHERE id = NEW.source_registry_id
    AND tenant_id = NEW.tenant_id AND jurisdiction_id = NEW.jurisdiction_id;
  IF NOT FOUND OR NEW.kind <> ALL(registry.record_kinds) THEN
    RAISE EXCEPTION 'source record kind not allowed by registry';
  END IF;
  IF parent.id IS NULL OR NEW.provenance_issuer IS DISTINCT FROM parent.issuer OR
     NEW.provenance_source_url IS DISTINCT FROM parent.source_url OR
     NEW.provenance_source_vintage IS DISTINCT FROM parent.source_vintage OR
     NEW.provenance_source_issued_at IS DISTINCT FROM parent.source_issued_at OR
     NEW.provenance_fetched_at IS DISTINCT FROM parent.fetched_at OR
     NEW.provenance_expires_at IS DISTINCT FROM parent.expires_at OR
     NEW.provenance_complete_snapshot IS DISTINCT FROM parent.complete_snapshot OR
     NEW.provenance_last_good_generation_id IS DISTINCT FROM parent.previous_complete_generation_id OR
     NEW.provenance_fetch_failure_kind IS NOT NULL OR
     NEW.provenance_fetch_failure_message IS NOT NULL OR
     NEW.provenance_fetch_failure_retryable IS NOT NULL THEN
    RAISE EXCEPTION 'source record provenance differs from generation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER source_record_payload_guard_trigger
  BEFORE INSERT OR UPDATE ON source_record FOR EACH ROW EXECUTE FUNCTION source_record_payload_guard();

-- Deferred because an immutable generation and its records arrive in one transaction.
CREATE OR REPLACE FUNCTION source_generation_record_count_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  generation_uuid uuid;
  expected_count integer;
  actual_count integer;
BEGIN
  IF TG_TABLE_NAME = 'source_generation' THEN
    generation_uuid := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    generation_uuid := OLD.generation_id;
  ELSE
    generation_uuid := NEW.generation_id;
  END IF;
  SELECT record_count INTO expected_count FROM source_generation WHERE id = generation_uuid;
  SELECT count(*) INTO actual_count FROM source_record WHERE generation_id = generation_uuid;
  IF expected_count IS NULL OR expected_count <> actual_count THEN
    RAISE EXCEPTION 'source generation record count mismatch';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER source_generation_count_guard_trigger
  AFTER INSERT ON source_generation DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION source_generation_record_count_guard();
CREATE CONSTRAINT TRIGGER source_record_count_guard_trigger
  AFTER INSERT OR DELETE ON source_record DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION source_generation_record_count_guard();

-- Neither failures nor immutable historic records can be erased and replaced
-- with a different payload that happens to have the same generation row count.
CREATE OR REPLACE FUNCTION prevent_source_cache_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'source cache history cannot be deleted';
END;
$$;
CREATE TRIGGER source_registry_no_delete BEFORE DELETE ON source_registry
  FOR EACH ROW EXECUTE FUNCTION prevent_source_cache_delete();
CREATE TRIGGER source_fetch_attempt_no_delete BEFORE DELETE ON source_fetch_attempt
  FOR EACH ROW EXECUTE FUNCTION prevent_source_cache_delete();
CREATE TRIGGER source_record_no_delete BEFORE DELETE ON source_record
  FOR EACH ROW EXECUTE FUNCTION prevent_source_cache_delete();

COMMIT;
