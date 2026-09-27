import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PostgresSourceCacheStorage } from "./source-cache-postgres";

// Only tests the connection-lifecycle failure path. No database or publisher.
const harness = (failAt: "ROLLBACK" | "COMMIT") => {
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql === failAt) throw new Error(`${failAt} transport failure`);
  });
  const pool = { connect: vi.fn(async () => ({ query, release }) as unknown as PoolClient) } as unknown as Pool;
  const storage = new PostgresSourceCacheStorage(pool);
  const transaction = (storage as unknown as {
    transaction: (action: (client: PoolClient) => Promise<string>) => Promise<string>;
  }).transaction.bind(storage);
  return { query, release, transaction };
};

describe("source transaction connection safety", () => {
  it("discards a client after failed rollback rather than returning it to the pool", async () => {
    const { transaction, release, query } = harness("ROLLBACK");
    await expect(transaction(async () => { throw new Error("synthetic operation failure"); })).rejects.toThrow("rollback failed");
    expect(query.mock.calls.map((call) => call[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("discards a client after indeterminate COMMIT failure; does not claim rollback", async () => {
    const { transaction, release, query } = harness("COMMIT");
    await expect(transaction(async () => "synthetic result")).rejects.toThrow("COMMIT transport failure");
    expect(query.mock.calls.map((call) => call[0])).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });
});
