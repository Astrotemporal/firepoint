import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { PublishedObservation } from "@/domain/contracts";
import {
  CONSENT_VERSION, ObservationSubmission, RETENTION_DAYS, type ModerationDecision, type ObservationStore,
  type Requester, type StoredObservation,
} from "./observations";

export const DEFAULT_TENANT_ID = "glendale-preview";
export const PURGE_BATCH_SIZE = 1000;

type DbObservationRow = {
  id: string; tenant_id: string; topic: PublishedObservation["topic"]; report_text: string;
  observed_at: string | null; longitude: string | number; latitude: string | number; precision_meters: number;
  submitted_at: string; expires_at: string; status: "pending" | "approved" | "rejected";
  moderator_name: string | null; moderated_at: string | null;
};

type DbPublishedRow = {
  id: string; topic: PublishedObservation["topic"]; report_text: string; observed_at: string | null; published_at: string;
  longitude: string | number; latitude: string | number; precision_meters: number;
};

function rowToStored(row: DbObservationRow): StoredObservation {
  return {
    id: row.id,
    topic: row.topic,
    text: row.report_text,
    observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
    approximatePoint: [Number(row.longitude), Number(row.latitude)],
    precisionMeters: row.precision_meters,
    submittedAt: new Date(row.submitted_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    status: row.status,
    moderatorName: row.moderator_name,
    moderatedAt: row.moderated_at ? new Date(row.moderated_at).toISOString() : null,
  };
}

function rowToPublished(row: DbPublishedRow): PublishedObservation {
  return {
    kind: "community-observation",
    id: row.id,
    topic: row.topic,
    // Moderator-approved text stays private to moderation tools in this preview. Public aggregate never exposes text.
    redactedText: "approved community observation",
    observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
    publishedAt: new Date(row.published_at).toISOString(),
    approximatePoint: [Number(row.longitude), Number(row.latitude)],
    precisionMeters: row.precision_meters,
    verification: "unverified",
  };
}

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || process.env.NEON_DATABASE_URL?.trim() || null;
}

export function tenantId(): string {
  return process.env.FIREPOINT_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
}

export function createPostgresObservationStore(connectionString = databaseUrl(), tenant = tenantId()): ObservationStore | null {
  if (!connectionString) return null;
  return new PostgresObservationStore(neon(connectionString), tenant);
}

export class PostgresObservationStore implements ObservationStore {
  constructor(private readonly sql: NeonQueryFunction<false, false>, private readonly tenant: string) {}

  async recordSubmission(input: { id: string; submission: ObservationSubmission; requester: Requester; now: string; expiresAt: string }): Promise<void> {
    const { id, submission, requester, now, expiresAt } = input;
    const [longitude, latitude] = submission.approximatePoint;
    await this.sql`
      insert into community_observations (
        id, tenant_id, status, topic, report_text, observed_at, longitude, latitude, precision_meters,
        submitted_at, expires_at, consent_version, consent_retention_days, reporter_hash, ip_hash, user_agent_hash, rate_key
      ) values (
        ${id}, ${this.tenant}, 'pending', ${submission.topic}, ${submission.text}, ${submission.observedAt ?? null},
        ${longitude}, ${latitude}, ${submission.precisionMeters}, ${now}, ${expiresAt}, ${CONSENT_VERSION}, ${RETENTION_DAYS},
        ${requester.reporterHash}, ${requester.ipHash}, ${requester.userAgentHash}, ${requester.rateKey}
      )`;
  }

  async incrementRateLimit(input: { rateKey: string; windowStart: string; now: string }): Promise<number> {
    const rows = await this.sql`
      insert into community_observation_rate_limits (tenant_id, rate_key, window_start, count, updated_at)
      values (${this.tenant}, ${input.rateKey}, ${input.windowStart}, 1, ${input.now})
      on conflict (tenant_id, rate_key, window_start) do update
        set count = community_observation_rate_limits.count + 1, updated_at = excluded.updated_at
      returning count`;
    const typed = rows as unknown as { count: number }[];
    return typed[0]?.count ?? 0;
  }

  async listPending(limit: number): Promise<StoredObservation[]> {
    const rows = await this.sql`
      select id, tenant_id, topic, report_text, observed_at, longitude, latitude, precision_meters,
             submitted_at, expires_at, status, moderator_name, moderated_at
      from community_observations
      where tenant_id = ${this.tenant} and status = 'pending' and expires_at > now()
      order by submitted_at asc
      limit ${limit}`;
    return (rows as unknown as DbObservationRow[]).map(rowToStored);
  }

  async moderate(input: ModerationDecision & { decidedAt: string }): Promise<StoredObservation | null> {
    const rows = await this.sql`
      with updated as (
        update community_observations
        set status = ${input.decision}, moderator_name = ${input.operatorName}, moderation_reason = ${input.reason}, moderated_at = ${input.decidedAt}
        where tenant_id = ${this.tenant} and id = ${input.receiptId} and status = 'pending' and expires_at > now()
        returning id, tenant_id, topic, report_text, observed_at, longitude, latitude, precision_meters,
                  submitted_at, expires_at, status, moderator_name, moderated_at
      ), audit as (
        insert into community_observation_moderation_audit (tenant_id, observation_id, operator_name, decision, reason, decided_at)
        select ${this.tenant}, id, ${input.operatorName}, ${input.decision}, ${input.reason}, ${input.decidedAt} from updated
        returning observation_id
      )
      select updated.* from updated join audit on audit.observation_id = updated.id`;
    const row = (rows as unknown as DbObservationRow[])[0];
    return row ? rowToStored(row) : null;
  }

  async listApproved(now: string): Promise<PublishedObservation[]> {
    const rows = await this.sql`
      select id, topic, report_text, observed_at, moderated_at as published_at, longitude, latitude, precision_meters
      from community_observations
      where tenant_id = ${this.tenant} and status = 'approved' and expires_at > ${now} and moderated_at is not null
      order by id asc
      limit 10001`;
    const typed = rows as unknown as DbPublishedRow[];
    if (typed.length > 10000) throw new Error("approved observation query exceeded 10000 row safety cap");
    return typed.map(rowToPublished);
  }

  async cleanupExpired(now: string): Promise<{ deleted: number; rateBucketsDeleted: number; moreMayRemain: boolean }> {
    // One statement keeps both deletes atomic. Batches cap work per Preview invocation and
    // counts avoid returning a potentially unbounded list of raw receipt IDs.
    const rows = await this.sql`
      with expired_candidates as (
        select id from community_observations
        where tenant_id = ${this.tenant} and expires_at <= ${now}
        order by expires_at, id limit ${PURGE_BATCH_SIZE}
        for update
      ), expired as (
        delete from community_observations o using expired_candidates c
        where o.id = c.id and o.tenant_id = ${this.tenant}
        returning 1
      ), rate_candidates as (
        select tenant_id, rate_key, window_start from community_observation_rate_limits
        where tenant_id = ${this.tenant} and window_start < (${now}::timestamptz - interval '2 days')
        order by window_start, rate_key limit ${PURGE_BATCH_SIZE}
        for update
      ), old_rates as (
        delete from community_observation_rate_limits r using rate_candidates c
        where r.tenant_id = c.tenant_id and r.rate_key = c.rate_key and r.window_start = c.window_start
        returning 1
      )
      select (select count(*) from expired)::integer as deleted,
             (select count(*) from old_rates)::integer as rate_buckets_deleted`;
    const result = (rows as unknown as { deleted: number; rate_buckets_deleted: number }[])[0];
    if (!result || ![result.deleted, result.rate_buckets_deleted].every((count) => Number.isSafeInteger(count) && count >= 0 && count <= PURGE_BATCH_SIZE)) {
      throw new Error("invalid purge result");
    }
    return {
      deleted: result.deleted,
      rateBucketsDeleted: result.rate_buckets_deleted,
      moreMayRemain: result.deleted === PURGE_BATCH_SIZE || result.rate_buckets_deleted === PURGE_BATCH_SIZE,
    };
  }
}
