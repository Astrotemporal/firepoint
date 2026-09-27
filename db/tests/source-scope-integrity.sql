-- Synthetic-only PostgreSQL integration check. Apply 0100 then 0101 to a disposable DB.
-- Nothing here calls a publisher; ROLLBACK leaves the test database unchanged.
BEGIN;
CREATE FUNCTION assert_source_rejected(command text, expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  EXECUTE command;
  RAISE EXCEPTION 'expected source-cache rejection: %', expected;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual = MESSAGE_TEXT;
  IF actual LIKE 'expected source-cache rejection:%' OR position(expected in actual) = 0 THEN
    RAISE EXCEPTION 'unexpected source-cache result: % (expected %)', actual, expected;
  END IF;
END;
$$;
INSERT INTO source_registry
(id, tenant_id, jurisdiction_id, source_key, registry_class, display_name, issuer, source_url,
 record_kinds, coverage_status, rights_status, empty_ok, empty_result_meaning,
 production_auto_polling_enabled, notes, created_at, updated_at)
VALUES
('11111111-1111-4111-8111-111111111111','synthetic-tenant','us.ca.glendale','test-source',
 'official-live-candidate','synthetic','Synthetic Agency','https://example.org/source',
 ARRAY['shelter-status'], 'validated-complete-for-scope','storage-approved',true,'not-all-clear',false,
 'synthetic fixture','2026-09-27T00:00:00Z','2026-09-27T00:00:00Z'),
('22222222-2222-4222-8222-222222222222','synthetic-tenant','us.ca.glendale','other-source',
 'official-live-candidate','other synthetic','Other Agency','https://example.org/other',
 ARRAY['shelter-status'], 'validated-complete-for-scope','storage-approved',true,'not-all-clear',false,
 'synthetic fixture','2026-09-27T00:00:00Z','2026-09-27T00:00:00Z');

INSERT INTO source_fetch_attempt
(id, source_registry_id, tenant_id, jurisdiction_id, status, started_at, rows_seen, rows_accepted,
 complete_snapshot, empty_ok)
VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
 'synthetic-tenant','us.ca.glendale','started','2026-09-27T01:00:00Z',0,0,false,true);
-- Two fetches overlap before either publishes a complete generation.
INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
 complete_snapshot,empty_ok)
VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111',
 'synthetic-tenant','us.ca.glendale','started','2026-09-27T01:00:30Z',0,0,false,true);
UPDATE source_fetch_attempt SET status='succeeded-non-empty', completed_at='2026-09-27T01:02:00Z',
 rows_seen=1,rows_accepted=1,complete_snapshot=true
WHERE id='33333333-3333-4333-8333-333333333333';
INSERT INTO source_generation
(id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,issuer,
 source_url,source_vintage,fetched_at,record_count,complete_snapshot,empty_result_meaning,created_at)
VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333','synthetic-tenant','us.ca.glendale',1,'Synthetic Agency',
 'https://example.org/source','synthetic','2026-09-27T01:02:00Z',1,true,'not-all-clear','2026-09-27T01:02:00Z');
INSERT INTO source_record
(id,source_registry_id,generation_id,tenant_id,jurisdiction_id,upstream_record_id,kind,status,
 name,provenance_issuer,provenance_source_url,provenance_source_vintage,provenance_fetched_at,
 provenance_complete_snapshot,created_at)
VALUES ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',
 '44444444-4444-4444-8444-444444444444','synthetic-tenant','us.ca.glendale',
 'synthetic-record','shelter-status','current','synthetic fixture','Synthetic Agency',
 'https://example.org/source','synthetic','2026-09-27T01:02:00Z',true,'2026-09-27T01:02:00Z');
SET CONSTRAINTS ALL IMMEDIATE;
UPDATE source_fetch_attempt SET status='succeeded-empty',completed_at='2026-09-27T01:03:00Z',complete_snapshot=true
  WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff';
SELECT assert_source_rejected($sql$INSERT INTO source_generation
(id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,issuer,
 source_url,source_vintage,fetched_at,record_count,complete_snapshot,empty_result_meaning,created_at)
VALUES ('f0000000-0000-4000-8000-000000000000','11111111-1111-4111-8111-111111111111',
 'ffffffff-ffff-4fff-8fff-ffffffffffff','synthetic-tenant','us.ca.glendale',2,'Synthetic Agency',
 'https://example.org/source','synthetic','2026-09-27T01:03:00Z',0,true,'not-all-clear',
 '2026-09-27T01:03:00Z')$sql$, 'stale or forked source generation');
SELECT assert_source_rejected($sql$DELETE FROM source_record
  WHERE id='55555555-5555-4555-8555-555555555555'$sql$, 'source cache history cannot be deleted');
SELECT assert_source_rejected($sql$DELETE FROM source_fetch_attempt
  WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff'$sql$, 'source cache history cannot be deleted');
SELECT assert_source_rejected($sql$UPDATE source_registry SET issuer='Other Agency'
 WHERE id='11111111-1111-4111-8111-111111111111'$sql$, 'immutable');
SELECT assert_source_rejected($sql$UPDATE source_record SET provenance_issuer='Other Agency'
 WHERE id='55555555-5555-4555-8555-555555555555'$sql$, 'immutable');
SELECT assert_source_rejected($sql$UPDATE source_fetch_attempt SET status='failed'
 WHERE id='33333333-3333-4333-8333-333333333333'$sql$, 'invalid source fetch attempt transition');
SELECT assert_source_rejected($sql$INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
 complete_snapshot,empty_ok,last_good_generation_id)
VALUES ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222',
'synthetic-tenant','us.ca.glendale','started','2026-09-27T02:00:00Z',0,0,false,true,
'44444444-4444-4444-8444-444444444444')$sql$, 'invalid initial source fetch attempt');
SELECT assert_source_rejected($sql$INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
 complete_snapshot,empty_ok,last_good_generation_id)
VALUES ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',
'synthetic-tenant','us.ca.glendale','started','2026-09-27T02:00:00Z',0,0,false,true,null)$sql$,
'invalid initial source fetch attempt');
INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
 complete_snapshot,empty_ok,last_good_generation_id)
VALUES ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',
'synthetic-tenant','us.ca.glendale','started','2026-09-27T02:00:00Z',0,0,false,true,
'44444444-4444-4444-8444-444444444444');
SELECT assert_source_rejected($sql$UPDATE source_fetch_attempt SET status='failed',
 completed_at='2026-09-27T02:01:00Z',failure_kind='network',failure_message='synthetic failure',
 failure_retryable=true,last_good_generation_id=null
 WHERE id='88888888-8888-4888-8888-888888888888'$sql$, 'invalid source fetch attempt transition');
UPDATE source_fetch_attempt SET status='failed',completed_at='2026-09-27T02:01:00Z',
 failure_kind='network',failure_message='synthetic failure',failure_retryable=true
WHERE id='88888888-8888-4888-8888-888888888888';
SELECT assert_source_rejected($sql$INSERT INTO source_generation
(id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,issuer,
 source_url,source_vintage,fetched_at,record_count,complete_snapshot,empty_result_meaning,created_at,
 previous_complete_generation_id)
VALUES ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111',
'88888888-8888-4888-8888-888888888888','synthetic-tenant','us.ca.glendale',2,'Synthetic Agency',
'https://example.org/source','synthetic','2026-09-27T02:01:00Z',0,true,'not-all-clear',
'2026-09-27T02:01:00Z','44444444-4444-4444-8444-444444444444')$sql$,
'generation does not match a successful fetch');
-- A complete generation cannot retract an ID that it itself contains.
SELECT assert_source_rejected($sql$UPDATE source_record
 SET status='retracted',retracted_by_generation_id='44444444-4444-4444-8444-444444444444'
 WHERE id='55555555-5555-4555-8555-555555555555'$sql$,
'retraction requires latest later complete source generation');

-- Incomplete generation may be retained but can never become last-good.
INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
 complete_snapshot,empty_ok,last_good_generation_id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
'synthetic-tenant','us.ca.glendale','started','2026-09-27T03:00:00Z',0,0,false,true,
'44444444-4444-4444-8444-444444444444');
UPDATE source_fetch_attempt SET status='succeeded-empty',completed_at='2026-09-27T03:01:00Z'
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO source_generation
(id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,issuer,
 source_url,source_vintage,fetched_at,record_count,complete_snapshot,empty_result_meaning,created_at,
 previous_complete_generation_id)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','synthetic-tenant','us.ca.glendale',2,'Synthetic Agency',
'https://example.org/source','synthetic','2026-09-27T03:01:00Z',0,false,'not-all-clear',
'2026-09-27T03:01:00Z','44444444-4444-4444-8444-444444444444');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT assert_source_rejected($sql$INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
 complete_snapshot,empty_ok,last_good_generation_id)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
'synthetic-tenant','us.ca.glendale','started','2026-09-27T04:00:00Z',0,0,false,true,
'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$sql$, 'invalid initial source fetch attempt');
INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
 complete_snapshot,empty_ok,last_good_generation_id)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
'synthetic-tenant','us.ca.glendale','started','2026-09-27T04:00:00Z',0,0,false,true,
'44444444-4444-4444-8444-444444444444');
UPDATE source_fetch_attempt SET status='succeeded-empty',completed_at='2026-09-27T04:01:00Z',
complete_snapshot=true WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT assert_source_rejected($sql$INSERT INTO source_generation
(id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,issuer,
 source_url,source_vintage,fetched_at,record_count,complete_snapshot,empty_result_meaning,created_at,
 previous_complete_generation_id)
VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
'dddddddd-dddd-4ddd-8ddd-dddddddddddd','synthetic-tenant','us.ca.glendale',3,'Synthetic Agency',
'https://example.org/source','synthetic','2026-09-27T04:01:00Z',0,true,'not-all-clear',
'2026-09-27T04:01:00Z','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$sql$,
'previous complete generation differs from fetch last-good');

-- Valid complete empty generations are still "not-all-clear" source-health data.
INSERT INTO source_generation
(id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,issuer,
 source_url,source_vintage,fetched_at,record_count,complete_snapshot,empty_result_meaning,created_at,
 previous_complete_generation_id)
VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
'dddddddd-dddd-4ddd-8ddd-dddddddddddd','synthetic-tenant','us.ca.glendale',3,'Synthetic Agency',
'https://example.org/source','synthetic','2026-09-27T04:01:00Z',0,true,'not-all-clear',
'2026-09-27T04:01:00Z','44444444-4444-4444-8444-444444444444');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT assert_source_rejected($sql$INSERT INTO source_record
(id,source_registry_id,generation_id,tenant_id,jurisdiction_id,upstream_record_id,kind,status,
 name,provenance_issuer,provenance_source_url,provenance_source_vintage,provenance_fetched_at,
 provenance_complete_snapshot,provenance_last_good_generation_id,
 provenance_fetch_failure_message,created_at)
VALUES ('a0000000-0000-4000-8000-000000000000','11111111-1111-4111-8111-111111111111',
'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','synthetic-tenant','us.ca.glendale',
'synthetic-invalid','shelter-status','current','invalid success provenance','Synthetic Agency',
'https://example.org/source','synthetic','2026-09-27T04:01:00Z',true,
'44444444-4444-4444-8444-444444444444','synthetic failure message','2026-09-27T04:01:00Z')$sql$,
'source record provenance differs from generation');
INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
 complete_snapshot,empty_ok,last_good_generation_id)
VALUES ('12345678-1234-4234-8234-123456789abc','11111111-1111-4111-8111-111111111111',
'synthetic-tenant','us.ca.glendale','started','2026-09-27T05:00:00Z',0,0,false,true,
'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
UPDATE source_fetch_attempt SET status='succeeded-empty',completed_at='2026-09-27T05:01:00Z',
complete_snapshot=true WHERE id='12345678-1234-4234-8234-123456789abc';
INSERT INTO source_generation
(id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,issuer,
 source_url,source_vintage,fetched_at,record_count,complete_snapshot,empty_result_meaning,created_at,
 previous_complete_generation_id)
VALUES ('abcabcab-abca-4abc-8abc-abcabcabcabc','11111111-1111-4111-8111-111111111111',
'12345678-1234-4234-8234-123456789abc','synthetic-tenant','us.ca.glendale',4,'Synthetic Agency',
'https://example.org/source','synthetic','2026-09-27T05:01:00Z',0,true,'not-all-clear',
'2026-09-27T05:01:00Z','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT assert_source_rejected($sql$UPDATE source_record SET status='retracted',
 retracted_by_generation_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
 WHERE id='55555555-5555-4555-8555-555555555555'$sql$,
'retraction requires latest later complete source generation');
SELECT assert_source_rejected($sql$UPDATE source_record SET status='retracted',
 retracted_by_generation_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 WHERE id='55555555-5555-4555-8555-555555555555'$sql$,
'retraction requires latest later complete source generation');
UPDATE source_record SET status='retracted',
 retracted_by_generation_id='abcabcab-abca-4abc-8abc-abcabcabcabc'
 WHERE id='55555555-5555-4555-8555-555555555555';
ROLLBACK;
