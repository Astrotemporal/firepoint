import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublishedObservation } from "@/domain/contracts";
import {
  AGGREGATION_CONFIG, IP_RATE_LIMIT_MAX_PER_HOUR, JSON_BODY_LIMIT_BYTES, RATE_LIMIT_MAX_PER_HOUR, RETENTION_DAYS,
  buildPublicAggregate, handleGetAggregate, handleListPending, handleModerateObservation, handlePurgeExpired, handleSubmitObservation,
  type ModerationDecision, type ObservationStore, type ObservationSubmission, type Requester, type StoredObservation,
} from "./observations";

class FakeStore implements ObservationStore {
  rows: StoredObservation[] = [];
  rate = new Map<string, number>();
  decisions: Array<ModerationDecision & { decidedAt: string }> = [];
  expiredCleanups = 0;

  async recordSubmission(input: { id: string; submission: ObservationSubmission; requester: Requester; now: string; expiresAt: string }) {
    const [longitude, latitude] = input.submission.approximatePoint;
    this.rows.push({
      id: input.id, topic: input.submission.topic, text: input.submission.text, observedAt: input.submission.observedAt ?? null,
      approximatePoint: [longitude, latitude], precisionMeters: input.submission.precisionMeters, submittedAt: input.now,
      expiresAt: input.expiresAt, status: "pending", moderatorName: null, moderatedAt: null,
    });
  }
  async incrementRateLimit(input: { rateKey: string }) {
    const next = (this.rate.get(input.rateKey) ?? 0) + 1;
    this.rate.set(input.rateKey, next);
    return next;
  }
  async listPending(limit: number) { return this.rows.filter((row) => row.status === "pending").slice(0, limit); }
  async moderate(input: ModerationDecision & { decidedAt: string }) {
    const row = this.rows.find((item) => item.id === input.receiptId && item.status === "pending");
    if (!row) return null;
    row.status = input.decision;
    row.moderatorName = input.operatorName;
    row.moderatedAt = input.decidedAt;
    this.decisions.push(input);
    return row;
  }
  async listApproved(): Promise<PublishedObservation[]> {
    return this.rows.filter((row) => row.status === "approved").map((row) => ({
      kind: "community-observation", id: row.id, topic: row.topic, redactedText: "approved community observation",
      observedAt: row.observedAt, publishedAt: row.moderatedAt ?? row.submittedAt, approximatePoint: row.approximatePoint,
      precisionMeters: row.precisionMeters, verification: "unverified",
    }));
  }
  async cleanupExpired() { this.expiredCleanups += 1; return 0; }
}

const now = "2026-09-26T20:00:00.000Z";
const point: [number, number] = [-118.23991, 34.15991];
function payload(overrides: Record<string, unknown> = {}) {
  return {
    userInitiated: true, topic: "smoke", text: "Visible smoke from my block", observedAt: "2026-09-26T19:30:00.000Z",
    approximatePoint: point, precisionMeters: 800,
    consent: { submitObservation: true, publishIfApproved: true, retentionDays: RETENTION_DAYS }, website: "", ...overrides,
  };
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/observations/submit", {
    method: "POST", headers: { "Content-Type": "application/json", "x-vercel-forwarded-for": "203.0.113.4", "user-agent": "vitest", ...headers },
    body: JSON.stringify(body),
  });
}

function configureModeration() {
  vi.stubEnv("FIREPOINT_MODERATION_OWNER", "Casey Moderator");
  vi.stubEnv("FIREPOINT_MODERATION_POLICY_VERSION", "preview-policy-v1");
  vi.stubEnv("FIREPOINT_TRUSTED_IP_HEADER", "x-vercel-forwarded-for");
}

afterEach(() => vi.unstubAllEnvs());

describe("community observation backend handlers", () => {
  it("requires moderation config, explicit consent and a server-side abuse salt before storing raw reports", async () => {
    const store = new FakeStore();
    expect((await handleSubmitObservation(request(payload()), store, now)).status).toBe(503);
    configureModeration();
    expect((await handleSubmitObservation(request(payload()), store, now)).status).toBe(503);
    vi.stubEnv("FIREPOINT_ABUSE_SALT", "synthetic-test-salt");
    expect((await handleSubmitObservation(request(payload({ consent: { submitObservation: false, publishIfApproved: true, retentionDays: RETENTION_DAYS } })), store, now)).status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });


  it("fails closed until the trusted Vercel IP header is configured and present", async () => {
    vi.stubEnv("FIREPOINT_MODERATION_OWNER", "Casey Moderator");
    vi.stubEnv("FIREPOINT_MODERATION_POLICY_VERSION", "preview-policy-v1");
    vi.stubEnv("FIREPOINT_ABUSE_SALT", "synthetic-test-salt");
    const store = new FakeStore();
    vi.stubEnv("FIREPOINT_TRUSTED_IP_HEADER", "");
    expect((await handleSubmitObservation(request(payload()), store, now)).status).toBe(503);
    vi.stubEnv("FIREPOINT_TRUSTED_IP_HEADER", "x-vercel-forwarded-for");
    expect((await handleSubmitObservation(request(payload(), { "x-vercel-forwarded-for": "" }), store, now)).status).toBe(503);
    expect(store.rows).toHaveLength(0);
  });

  it("accepts only explicit in-coverage submissions and returns a pending receipt, not publication", async () => {
    configureModeration();
    vi.stubEnv("FIREPOINT_ABUSE_SALT", "synthetic-test-salt");
    const store = new FakeStore();
    const response = await handleSubmitObservation(request(payload()), store, now);
    expect(response.status).toBe(202);
    const receipt = await response.json();
    expect(receipt).toMatchObject({ disposition: "awaiting-moderation", emergencyDispatch: false });
    expect(receipt.receiptId).toMatch(/[0-9a-f-]{36}/);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ status: "pending", moderatorName: null });
    expect(store.rows[0]!.approximatePoint).not.toEqual(point);
    expect(Math.abs(store.rows[0]!.approximatePoint[0] - point[0])).toBeLessThan(0.01);
    expect(new Date(store.rows[0]!.expiresAt).getTime() - Date.parse(now)).toBe(RETENTION_DAYS * 86_400_000);
  });

  it("bounds inputs to Glendale preview coverage and throttles abuse without treating a cookie as a human", async () => {
    configureModeration();
    vi.stubEnv("FIREPOINT_ABUSE_SALT", "synthetic-test-salt");
    const store = new FakeStore();
    expect((await handleSubmitObservation(request(payload({ approximatePoint: [-118.9, 34.16] })), store, now)).status).toBe(400);
    for (let i = 0; i < RATE_LIMIT_MAX_PER_HOUR; i += 1) expect((await handleSubmitObservation(request(payload({ text: `Report ${i}` })), store, now)).status).toBe(202);
    expect((await handleSubmitObservation(request(payload({ text: "one too many" })), store, now)).status).toBe(429);
  });

  it("requires a moderator token, named operator and audit reason", async () => {
    configureModeration();
    vi.stubEnv("FIREPOINT_MODERATOR_TOKEN", "secret");
    const store = new FakeStore();
    store.rows.push({ id: "00000000-0000-4000-8000-000000000001", topic: "smoke", text: "x", observedAt: null, approximatePoint: point, precisionMeters: 800,
      submittedAt: now, expiresAt: "2026-10-10T20:00:00.000Z", status: "pending", moderatorName: null, moderatedAt: null });
    expect((await handleListPending(new Request("http://localhost"), store)).status).toBe(401);
    const auth = { Authorization: "Bearer secret", "Content-Type": "application/json" };
    expect((await handleListPending(new Request("http://localhost", { headers: auth }), store)).status).toBe(200);
    const approve = await handleModerateObservation(new Request("http://localhost", { method: "POST", headers: auth,
      body: JSON.stringify({ receiptId: store.rows[0]!.id, decision: "approved", operatorName: "Casey Moderator", reason: "Within preview policy" }) }), store, now);
    expect(approve.status).toBe(200);
    expect(store.rows[0]).toMatchObject({ status: "approved", moderatorName: "Casey Moderator", moderatedAt: now });
    expect(store.decisions[0]).toMatchObject({ operatorName: "Casey Moderator", reason: "Within preview policy" });
  });

  it("fails closed until moderation owner and rights review are configured", async () => {
    const store = new FakeStore();
    for (let i = 0; i < 3; i += 1) store.rows.push({ id: `00000000-0000-4000-8000-00000000000${i}`, topic: "smoke", text: "x",
      observedAt: "2026-09-26T19:20:00.000Z", approximatePoint: point, precisionMeters: 800, submittedAt: now, expiresAt: "2026-10-10T20:00:00.000Z",
      status: "approved", moderatorName: "Casey Moderator", moderatedAt: "2026-09-26T19:50:00.000Z" });
    let aggregate = await buildPublicAggregate(store, now);
    expect(aggregate).toMatchObject({ state: "withheld", reason: "missing-moderation", allClear: false });
    vi.stubEnv("FIREPOINT_MODERATION_OWNER", "Preview moderation owner");
    vi.stubEnv("FIREPOINT_MODERATION_POLICY_VERSION", "preview-policy-v1");
    aggregate = await buildPublicAggregate(store, now);
    expect(aggregate).toMatchObject({ state: "withheld", reason: "missing-moderation" });
    vi.stubEnv("FIREPOINT_MODERATION_AT", "2026-09-26T19:55:00.000Z");
    aggregate = await buildPublicAggregate(store, now);
    expect(aggregate).toMatchObject({ state: "withheld", reason: "rights-unreviewed" });
    vi.stubEnv("FIREPOINT_REPORT_RIGHTS_REVIEWED", "true");
    aggregate = await buildPublicAggregate(store, now);
    expect(aggregate.state).toBe("published");
    const serialized = JSON.stringify(aggregate);
    expect(serialized).not.toContain(store.rows[0]!.id);
    expect(serialized).not.toContain(String(point[0]));
    if (aggregate.state === "published") {
      expect(aggregate.cells[0]).toMatchObject({ reportCount: 3, verification: "unverified" });
      expect(aggregate.cells[0]!.cellBounds[0][0]).toBeGreaterThanOrEqual(AGGREGATION_CONFIG.coverage.bounds[0][0]);
    }
  });


  it("caps JSON bodies even when Content-Length is absent or spoofed", async () => {
    configureModeration();
    vi.stubEnv("FIREPOINT_ABUSE_SALT", "synthetic-test-salt");
    const store = new FakeStore();
    const tooLarge = { ...payload(), text: "x".repeat(JSON_BODY_LIMIT_BYTES) };
    expect((await handleSubmitObservation(request(tooLarge), store, now)).status).toBe(413);
    const spoofed = request(tooLarge, { "Content-Length": "1" });
    expect((await handleSubmitObservation(spoofed, store, now)).status).toBe(413);
    expect(store.rows).toHaveLength(0);
  });

  it("keeps an independent IP bucket so cookie or user-agent rotation is not enough", async () => {
    configureModeration();
    vi.stubEnv("FIREPOINT_ABUSE_SALT", "synthetic-test-salt");
    const store = new FakeStore();
    for (let i = 0; i < IP_RATE_LIMIT_MAX_PER_HOUR; i += 1) {
      const headers = { Cookie: `firepoint_report_abuse=${i}`, "user-agent": `vitest-${i}` };
      expect((await handleSubmitObservation(request(payload({ text: `Report ${i}` }), headers), store, now)).status).toBe(202);
    }
    const response = await handleSubmitObservation(request(payload({ text: "ip bucket" }), { Cookie: "firepoint_report_abuse=fresh", "user-agent": "fresh" }), store, now);
    expect(response.status).toBe(429);
  });

  it("purges expired reports only with a protected purge token", async () => {
    const store = new FakeStore();
    expect((await handlePurgeExpired(new Request("http://localhost"), store, now)).status).toBe(503);
    vi.stubEnv("FIREPOINT_PURGE_TOKEN", "purge-secret");
    expect((await handlePurgeExpired(new Request("http://localhost", { headers: { Authorization: "Bearer wrong" } }), store, now)).status).toBe(401);
    const response = await handlePurgeExpired(new Request("http://localhost", { headers: { Authorization: "Bearer purge-secret" } }), store, now);
    expect(response.status).toBe(200);
    expect(store.expiredCleanups).toBe(1);
  });

  it("returns 503 for a withheld public aggregate rather than an empty success", async () => {
    const response = await handleGetAggregate(new FakeStore(), now);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ state: "withheld", allClear: false });
    // Aggregate reads do not perform retention cleanup; use the protected purge route or cron.
    const store = new FakeStore();
    await handleGetAggregate(store, now);
    expect(store.expiredCleanups).toBe(0);
  });
});
