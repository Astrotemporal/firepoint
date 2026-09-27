import { describe, expect, it, vi } from "vitest";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { PostgresObservationStore, PURGE_BATCH_SIZE } from "./observations-postgres";

const now = "2026-09-26T20:00:00.000Z";

describe("Preview purge SQL (synthetic rows; no database)", () => {
  it("deletes bounded batches in one statement and signals when another pass may be needed", async () => {
    const query = vi.fn().mockResolvedValue([{ deleted: PURGE_BATCH_SIZE, rate_buckets_deleted: 2 }]);
    const store = new PostgresObservationStore(query as unknown as NeonQueryFunction<false, false>, "test-tenant");
    expect(await store.cleanupExpired(now)).toEqual({ deleted: PURGE_BATCH_SIZE, rateBucketsDeleted: 2, moreMayRemain: true });
    expect(query).toHaveBeenCalledTimes(1);
    const [strings, ...values] = query.mock.calls[0]!;
    const sql = (strings as TemplateStringsArray).join("?");
    expect(sql).toContain("delete from community_observations o using expired_candidates c");
    expect(sql).toContain("delete from community_observation_rate_limits r using rate_candidates c");
    expect(sql).toContain("for update");
    expect(sql.match(/limit \?/g)).toHaveLength(2);
    expect(values.filter((value) => value === PURGE_BATCH_SIZE)).toHaveLength(2);
    expect(values.filter((value) => value === "test-tenant")).toHaveLength(3);
    expect(sql).not.toContain("returning id");
  });

  it("fails closed for absent or invalid count rows", async () => {
    for (const rows of [[], [{ deleted: -1, rate_buckets_deleted: 0 }], [{ deleted: 0, rate_buckets_deleted: PURGE_BATCH_SIZE + 1 }]]) {
      const query = vi.fn().mockResolvedValue(rows);
      const store = new PostgresObservationStore(query as unknown as NeonQueryFunction<false, false>, "test-tenant");
      await expect(store.cleanupExpired(now)).rejects.toThrow("invalid purge result");
    }
  });

  it("propagates database failure instead of claiming purge success", async () => {
    const query = vi.fn().mockRejectedValue(new Error("synthetic database failure"));
    const store = new PostgresObservationStore(query as unknown as NeonQueryFunction<false, false>, "test-tenant");
    await expect(store.cleanupExpired(now)).rejects.toThrow("synthetic database failure");
  });
});
