import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PostgresSourceCacheStorage } from "./source-cache-postgres";
import type { SourceFetchAttempt, SourceGeneration, SourceRecord } from "@/domain/source-cache";

// Opt-in disposable PostgreSQL 17 only. No live source, Neon database, or shared DB.
const url = process.env.SOURCE_CACHE_TEST_DATABASE_URL;
const pool = url ? new Pool({ connectionString: url, max: 8 }) : null;
const storage = pool ? new PostgresSourceCacheStorage(pool) : null;
const registryId = randomUUID();
const tenantId = `synthetic-${randomUUID().slice(0, 16)}`;
const scope = { tenantId, jurisdictionId: "us.ca.glendale", issuer: "Synthetic Agency" };
const alternate = { ...scope, issuer: "Other Synthetic Agency" };
const sourceUrl = "https://example.org/synthetic-integration-only";
const origin = Date.now();
const stamp = (minutes: number) => new Date(origin + minutes * 60000).toISOString();
let lastGood: string | null = null;
let firstRecordId = "";
let firstAttemptId = "";
let firstGenerationId = "";

function snapshot(number: number, minute: number, names: string[], expiry: string | null = stamp(120)) {
  const id = randomUUID(), attemptId = randomUUID();
  const attempt: SourceFetchAttempt = {
    tenantId, jurisdictionId: scope.jurisdictionId, id: attemptId, sourceRegistryId: registryId,
    status: names.length ? "succeeded-non-empty" : "succeeded-empty",
    startedAt: stamp(minute), completedAt: stamp(minute), upstreamRequestUrl: sourceUrl,
    httpStatus: 200, rowsSeen: names.length, rowsAccepted: names.length,
    completeSnapshot: true, emptyOk: names.length === 0,
    lastGoodGenerationId: lastGood, failure: null,
  };
  const generation: SourceGeneration = {
    tenantId, jurisdictionId: scope.jurisdictionId, id, sourceRegistryId: registryId,
    fetchAttemptId: attemptId, generationNumber: number, issuer: scope.issuer,
    sourceUrl, sourceVintage: "synthetic", sourceIssuedAt: null,
    fetchedAt: stamp(minute), expiresAt: expiry, recordCount: names.length,
    completeSnapshot: true, emptyResultMeaning: "not-all-clear",
    previousCompleteGenerationId: lastGood, createdAt: stamp(minute),
  };
  const records: SourceRecord[] = names.map((name) => ({
    tenantId, jurisdictionId: scope.jurisdictionId, id: randomUUID(), sourceRegistryId: registryId,
    generationId: id, upstreamRecordId: name, kind: "shelter-status", status: "current",
    name: `Synthetic ${name}`, description: null, locationText: null, point: null,
    provenance: { issuer: scope.issuer, sourceUrl, sourceVintage: "synthetic",
      sourceIssuedAt: null, fetchedAt: stamp(minute), expiresAt: expiry,
      completeSnapshot: true, lastGoodGenerationId: lastGood, fetchFailure: null },
    retractedByGenerationId: null, createdAt: stamp(minute),
  }));
  return { attempt, generation, records };
}
const started = (a: SourceFetchAttempt): SourceFetchAttempt => ({ ...a,
  status: "started", completedAt: null, rowsSeen: 0, rowsAccepted: 0, completeSnapshot: false,
});

// Sequential test state makes the last-good lineage and failure checks explicit.
describe.skipIf(!url || !storage || !pool)("source cache atomic adapter on disposable PostgreSQL 17", () => {
  beforeAll(async () => {
    await pool!.query(`insert into source_registry (id,tenant_id,jurisdiction_id,source_key,
      registry_class,display_name,issuer,source_url,record_kinds,coverage_status,
      rights_status,empty_ok,empty_result_meaning,production_auto_polling_enabled,
      notes,created_at,updated_at)
      values ($1,$2,$3,'synthetic-fixture','official-live-candidate','Synthetic fixture',$4,$5,
      array['shelter-status'],'validated-complete-for-scope','redistribution-approved',true,
      'not-all-clear',false,'disposable tests only',$6,$6)`,
    [registryId,tenantId,scope.jurisdictionId,scope.issuer,sourceUrl,stamp(-130)]);
  });
  afterAll(async () => { await pool?.end(); });
  it("rejects foreign issuer/scope and Zod-invalid stored data", async () => {
    expect(await storage!.getRegistry(alternate, registryId)).toBeNull();
    expect(await storage!.listRegistries(alternate)).toEqual([]);
    expect(await storage!.getRegistry({ ...scope, tenantId: "other-synthetic-tenant" }, registryId)).toBeNull();
    expect(await storage!.getRegistry({ ...scope, jurisdictionId: "us.ca.other" }, registryId)).toBeNull();
    expect(await storage!.getRegistry(scope, registryId)).toMatchObject({ issuer: scope.issuer });
    const probe = snapshot(1, -110, ["alpha"]);
    await expect(storage!.createFetchAttempt(alternate, started(probe.attempt))).rejects.toThrow();
    await pool!.query("update source_registry set notes='' where id=$1", [registryId]);
    await expect(storage!.getRegistry(scope, registryId)).rejects.toThrow();
    await pool!.query("update source_registry set notes='disposable tests only' where id=$1", [registryId]);
  });
  it("commits generation, records, and attempt together, scoped and timestamped", async () => {
    const input = snapshot(1, -100, ["alpha", "beta"]);
    firstRecordId = input.records[0]!.id;
    firstAttemptId = input.attempt.id;
    firstGenerationId = input.generation.id;
    await storage!.createFetchAttempt(scope, started(input.attempt));
    await storage!.commitCompleteSnapshot(scope, input);
    lastGood = input.generation.id;
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.id).toBe(lastGood);
    expect((await storage!.listCurrentRecords(scope, registryId)).map((r) => r.upstreamRecordId).sort()).toEqual(["alpha", "beta"]);
    expect(await storage!.listCurrentRecords(alternate, registryId)).toEqual([]);
    const state = await pool!.query("select status from source_fetch_attempt where id=$1", [firstAttemptId]);
    expect(state.rows[0].status).toBe("succeeded-non-empty");
    await pool!.query("update source_registry set rights_status='storage-approved' where id=$1", [registryId]);
    expect(await storage!.listCurrentRecords(scope, registryId)).toEqual([]);
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.id).toBe(firstGenerationId);
    await pool!.query("update source_registry set rights_status='unresolved' where id=$1", [registryId]);
    expect(await storage!.listCurrentRecords(scope, registryId)).toEqual([]);
    await pool!.query("update source_registry set rights_status='redistribution-approved' where id=$1", [registryId]);
  });
  it("rolls back attempt transition, generation, and first insert if a later insert fails", async () => {
    const input = snapshot(2, -90, ["gamma", "delta"]);
    const firstNewRecord = input.records[0]!.id;
    input.records[1]!.id = firstRecordId; // valid Zod payload, global DB primary-key collision on second insert
    await storage!.createFetchAttempt(scope, started(input.attempt));
    await expect(storage!.commitCompleteSnapshot(scope, input)).rejects.toThrow();
    const attemptState = await pool!.query("select status from source_fetch_attempt where id=$1", [input.attempt.id]);
    expect(attemptState.rows[0].status).toBe("started");
    expect((await pool!.query("select id from source_generation where id=$1", [input.generation.id])).rows).toEqual([]);
    expect((await pool!.query("select id from source_record where id=$1", [firstNewRecord])).rows).toEqual([]);
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.id).toBe(firstGenerationId);
  });
  it("commits failed attempt without advancing or retracting last-good", async () => {
    const input = snapshot(2, -80, ["irrelevant"]);
    await storage!.createFetchAttempt(scope, started(input.attempt));
    await storage!.finishWithoutCompleteSnapshot(scope, { ...input.attempt,
      status: "failed", completeSnapshot: false, rowsSeen: 0, rowsAccepted: 0,
      failure: { kind: "network", message: "synthetic failure", retryable: true },
    });
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.id).toBe(firstGenerationId);
    expect((await storage!.listCurrentRecords(scope, registryId)).length).toBe(2);
  });
  it("serializes competing commits and fails stale lineage without partial state", async () => {
    const a = snapshot(2, -70, ["alpha"]), b = snapshot(2, -69, ["beta"]);
    await storage!.createFetchAttempt(scope, started(a.attempt));
    await storage!.createFetchAttempt(scope, started(b.attempt));
    const results = await Promise.allSettled([
      storage!.commitCompleteSnapshot(scope, a), storage!.commitCompleteSnapshot(scope, b),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const winner = results[0]!.status === "fulfilled" ? a : b;
    const loser = winner === a ? b : a;
    lastGood = winner.generation.id;
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.id).toBe(lastGood);
    expect((await pool!.query("select status from source_fetch_attempt where id=$1", [loser.attempt.id])).rows[0].status).toBe("started");
    expect((await pool!.query("select id from source_generation where id=$1", [loser.generation.id])).rows).toEqual([]);
    const old = await pool!.query("select status from source_record where id=$1", [firstRecordId]);
    expect(["superseded", "retracted"]).toContain(old.rows[0].status);
  });
  it("rejects complete omissions under unverified, incomplete, or partial coverage without mutating current data", async () => {
    const candidate = snapshot(3, -65, []);
    await storage!.createFetchAttempt(scope, started(candidate.attempt));
    const before = await storage!.listCurrentRecords(scope, registryId);
    expect(before.length).toBeGreaterThan(0);
    for (const coverage of ["unverified", "incomplete", "validated-partial"]) {
      await pool!.query("update source_registry set coverage_status=$1 where id=$2", [coverage, registryId]);
      await expect(storage!.commitCompleteSnapshot(scope, candidate)).rejects.toThrow("coverage");
      expect((await pool!.query("select status from source_fetch_attempt where id=$1", [candidate.attempt.id])).rows[0].status).toBe("started");
      expect((await pool!.query("select id from source_generation where id=$1", [candidate.generation.id])).rows).toEqual([]);
      expect((await storage!.getLastGoodGeneration(scope, registryId))?.id).toBe(lastGood);
      expect(await storage!.listCurrentRecords(scope, registryId)).toEqual(before);
    }
    await pool!.query("update source_registry set coverage_status='validated-complete-for-scope' where id=$1", [registryId]);
  });
  it("rejects storage rights, disallowed kinds, empty opt-in, and forged registry URL without mutation", async () => {
    const empty = snapshot(3, -64, []);
    const nonempty = snapshot(3, -63, ["synthetic-disallowed-kind"]);
    const forged = snapshot(3, -62, ["synthetic-forged-url"]);
    forged.generation.sourceUrl = "https://example.org/forged-synthetic-only";
    forged.records[0]!.provenance.sourceUrl = forged.generation.sourceUrl;
    const before = await storage!.listCurrentRecords(scope, registryId);
    for (const candidate of [empty, nonempty, forged]) await storage!.createFetchAttempt(scope, started(candidate.attempt));
    await pool!.query("update source_registry set rights_status='preview-only' where id=$1", [registryId]);
    await expect(storage!.commitCompleteSnapshot(scope, empty)).rejects.toThrow("rights");
    await pool!.query("update source_registry set rights_status='redistribution-approved', empty_ok=false where id=$1", [registryId]);
    await expect(storage!.commitCompleteSnapshot(scope, empty)).rejects.toThrow("empty");
    await pool!.query("update source_registry set empty_ok=true, record_kinds=array['standing-reference'] where id=$1", [registryId]);
    await expect(storage!.commitCompleteSnapshot(scope, nonempty)).rejects.toThrow("kind");
    await pool!.query("update source_registry set record_kinds=array['shelter-status'] where id=$1", [registryId]);
    await expect(storage!.commitCompleteSnapshot(scope, forged)).rejects.toThrow("URL");
    for (const candidate of [empty, nonempty, forged]) {
      expect((await pool!.query("select status from source_fetch_attempt where id=$1", [candidate.attempt.id])).rows[0].status).toBe("started");
      expect((await pool!.query("select id from source_generation where id=$1", [candidate.generation.id])).rows).toEqual([]);
    }
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.id).toBe(lastGood);
    expect(await storage!.listCurrentRecords(scope, registryId)).toEqual(before);
  });
  it("retracts every absent current ID on a complete zero-row snapshot; never all-clear", async () => {
    const input = snapshot(3, -60, []);
    await storage!.createFetchAttempt(scope, started(input.attempt));
    await storage!.commitCompleteSnapshot(scope, input);
    lastGood = input.generation.id;
    expect(await storage!.listCurrentRecords(scope, registryId)).toEqual([]);
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.emptyResultMeaning).toBe("not-all-clear");
    const lingering = await pool!.query("select count(*)::int as count from source_record where source_registry_id=$1 and status='current'", [registryId]);
    expect(lingering.rows[0].count).toBe(0);
    const retractions = await pool!.query("select count(*)::int as count from source_record where retracted_by_generation_id=$1", [input.generation.id]);
    expect(retractions.rows[0].count).toBeGreaterThan(0);
  });
  it("keeps expired provenance historical but hides expired records from current reads", async () => {
    const input = snapshot(4, -30, ["expired"], stamp(-1));
    await storage!.createFetchAttempt(scope, started(input.attempt));
    await storage!.commitCompleteSnapshot(scope, input);
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.expiresAt).toBe(stamp(-1));
    expect(await storage!.listCurrentRecords(scope, registryId)).toEqual([]);
    lastGood = input.generation.id;
  });
  it("keeps null TTL provenance historical but unavailable to public current reads", async () => {
    const input = snapshot(5, -20, ["no-explicit-expiry"], null);
    await storage!.createFetchAttempt(scope, started(input.attempt));
    await storage!.commitCompleteSnapshot(scope, input);
    expect((await storage!.getLastGoodGeneration(scope, registryId))?.expiresAt).toBeNull();
    expect(await storage!.listCurrentRecords(scope, registryId)).toEqual([]);
  });
});
