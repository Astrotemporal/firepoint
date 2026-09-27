import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import type { PublishedObservation } from "@/domain/contracts";
import { ObservationAggregateSchema, aggregateObservations, type ObservationAggregate } from "@/domain/observation-aggregate";

export const COMMUNITY_HEADERS = { "Cache-Control": "no-store" } as const;
export const CONSENT_VERSION = "community-observation-preview-v1";
export const RETENTION_DAYS = 14;
export const JSON_BODY_LIMIT_BYTES = 2048;
export const RATE_LIMIT_MAX_PER_HOUR = 5;
export const IP_RATE_LIMIT_MAX_PER_HOUR = 20;
export const RATE_LIMIT_WINDOW_SECONDS = 3600;
export const TRUSTED_IP_HEADER = "x-vercel-forwarded-for";
export const AGGREGATION_CONFIG = {
  configVersion: "glendale-preview-2026-09-26-v1",
  algorithm: "coarse-cell-count-bin" as const,
  cellSizeDegrees: 0.02,
  timeBinSeconds: 3600,
  maxAgeSeconds: 7 * 86_400,
  minReportsPerCell: 3,
  countCap: 10,
  coverage: { description: "Glendale preview coverage; not an evacuation zone", bounds: [[-118.34, 34.1], [-118.18, 34.24]] as [[number, number], [number, number]] },
};

const Instant = z.iso.datetime({ offset: true });
const Point = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
export const ObservationTopicSchema = z.enum(["fire", "smoke", "flooding", "wind-damage", "road-obstruction", "utility", "other"]);

export const ObservationSubmissionSchema = z.object({
  userInitiated: z.literal(true),
  topic: ObservationTopicSchema,
  text: z.string().trim().min(1).max(1000),
  observedAt: Instant.nullable().optional(),
  approximatePoint: Point,
  precisionMeters: z.number().int().positive().max(1500),
  consent: z.object({
    submitObservation: z.literal(true),
    publishIfApproved: z.literal(true),
    retentionDays: z.literal(RETENTION_DAYS),
  }).strict(),
  // Hidden form field. If filled, it is probably automation.
  website: z.string().max(0).optional(),
}).strict().superRefine((item, ctx) => {
  if (!insideCoverage(item.approximatePoint)) {
    ctx.addIssue({ code: "custom", path: ["approximatePoint"], message: "observation is outside Glendale preview coverage" });
  }
});
export type ObservationSubmission = z.infer<typeof ObservationSubmissionSchema>;

export const ModerationDecisionSchema = z.object({
  receiptId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  operatorName: z.string().trim().min(2).max(120),
  reason: z.string().trim().min(3).max(500),
}).strict();
export type ModerationDecision = z.infer<typeof ModerationDecisionSchema>;

export type ObservationStatus = "pending" | "approved" | "rejected";
export type StoredObservation = {
  id: string;
  topic: z.infer<typeof ObservationTopicSchema>;
  text: string;
  observedAt: string | null;
  approximatePoint: [number, number];
  precisionMeters: number;
  submittedAt: string;
  expiresAt: string;
  status: ObservationStatus;
  moderatorName: string | null;
  moderatedAt: string | null;
};
export type SubmissionReceiptData = { receiptId: string; receivedAt: string; disposition: "awaiting-moderation"; emergencyDispatch: false };
export type Requester = { rateKey: string; ipRateKey: string; reporterHash: string; ipHash: string; userAgentHash: string | null };
export type ObservationStore = {
  recordSubmission(input: { id: string; submission: ObservationSubmission; requester: Requester; now: string; expiresAt: string }): Promise<void>;
  incrementRateLimit(input: { rateKey: string; windowStart: string; now: string }): Promise<number>;
  listPending(limit: number): Promise<StoredObservation[]>;
  moderate(input: ModerationDecision & { decidedAt: string }): Promise<StoredObservation | null>;
  listApproved(now: string): Promise<PublishedObservation[]>;
  cleanupExpired(now: string): Promise<{ deleted: number; rateBucketsDeleted: number; moreMayRemain: boolean }>;
};

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: COMMUNITY_HEADERS });
}

export function reportingPreviewEnabled(): boolean {
  return process.env.FIREPOINT_REPORTING_ENABLED === "preview-only" && process.env.VERCEL_ENV === "preview";
}

export function requireReportingPreview(): Response | null {
  return reportingPreviewEnabled() ? null : jsonError("Community reporting is disabled outside the protected Preview environment", 503);
}

export function moderationConfigured(): boolean {
  return Boolean(process.env.FIREPOINT_MODERATION_OWNER?.trim() && process.env.FIREPOINT_MODERATION_POLICY_VERSION?.trim());
}


async function readLimitedText(request: Request): Promise<string | Response> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length < 0) return jsonError("Invalid Content-Length", 400);
    if (length > JSON_BODY_LIMIT_BYTES) return jsonError("Request body is too large", 413);
  }
  if (!request.body) return jsonError("Malformed JSON", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > JSON_BODY_LIMIT_BYTES) {
        await reader.cancel();
        return jsonError("Request body is too large", 413);
      }
      chunks.push(value);
    }
  } catch {
    return jsonError("Malformed JSON", 400);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function readJson(request: Request): Promise<unknown | Response> {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().includes("application/json")) return jsonError("Content-Type must be application/json", 415);
  const text = await readLimitedText(request);
  if (text instanceof Response) return text;
  try { return JSON.parse(text); }
  catch { return jsonError("Malformed JSON", 400); }
}

export function insideCoverage(point: readonly [number, number]): boolean {
  const [[west, south], [east, north]] = AGGREGATION_CONFIG.coverage.bounds;
  const [longitude, latitude] = point;
  return longitude >= west && longitude < east && latitude >= south && latitude < north;
}

export function addDaysIso(now: string, days: number): string {
  return new Date(Date.parse(now) + days * 86_400_000).toISOString();
}

function firstForwardedIp(value: string | null): string {
  return value?.split(",")[0]?.trim() || "unknown-ip";
}

function trustedRequestIp(request: Request): string | null {
  // Do not fall back to plain X-Forwarded-For here. The owner must verify Vercel/proxy behavior and then set
  // FIREPOINT_TRUSTED_IP_HEADER=x-vercel-forwarded-for. Without that, report storage fails closed.
  if (process.env.FIREPOINT_TRUSTED_IP_HEADER !== TRUSTED_IP_HEADER) return null;
  const ip = firstForwardedIp(request.headers.get(TRUSTED_IP_HEADER));
  return ip === "unknown-ip" ? null : ip;
}

function hash(value: string, salt: string): string {
  return createHash("sha256").update(salt).update("\0").update(value).digest("hex");
}

export function requesterFrom(request: Request, salt: string): Requester | Response {
  const anonCookie = request.headers.get("Cookie")?.match(/(?:^|;\s*)firepoint_report_abuse=([^;]+)/)?.[1] ?? "no-cookie";
  const ip = trustedRequestIp(request);
  if (!ip) return jsonError("Trusted client IP header is not configured", 503);
  const ua = request.headers.get("user-agent") ?? "unknown-agent";
  // Abuse throttles only. The cookie and IP bucket do not prove distinct humans and do not prevent Sybil attacks.
  return {
    rateKey: hash(`combo:${anonCookie}:${ip}:${ua}`, salt),
    ipRateKey: hash(`ip-rate:${ip}`, salt),
    reporterHash: hash(`cookie:${anonCookie}`, salt),
    ipHash: hash(`ip:${ip}`, salt),
    userAgentHash: ua === "unknown-agent" ? null : hash(`ua:${ua}`, salt),
  };
}

export function rateWindowStart(now: string): string {
  const ms = Date.parse(now);
  return new Date(Math.floor(ms / (RATE_LIMIT_WINDOW_SECONDS * 1000)) * RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
}


const round6 = (value: number) => Number(value.toFixed(6));

export function coarsenPointToPrecision(point: readonly [number, number], precisionMeters: number): [number, number] {
  const stepDegrees = Math.max(0.001, precisionMeters / 111_000);
  return [round6(Math.round(point[0] / stepDegrees) * stepDegrees), round6(Math.round(point[1] / stepDegrees) * stepDegrees)];
}


export async function handleSubmitObservation(request: Request, store: ObservationStore, now = new Date().toISOString()): Promise<Response> {
  if (!moderationConfigured()) return jsonError("Community reporting moderation owner and policy are not configured", 503);
  const salt = process.env.FIREPOINT_ABUSE_SALT?.trim();
  if (!salt) return jsonError("Community reporting is not configured", 503);
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = ObservationSubmissionSchema.safeParse(raw);
  if (!parsed.success) return jsonError("Observation was not accepted: invalid or outside coverage", 400);

  const requester = requesterFrom(request, salt);
  if (requester instanceof Response) return requester;
  const approximatePoint = coarsenPointToPrecision(parsed.data.approximatePoint, parsed.data.precisionMeters);
  if (!insideCoverage(approximatePoint)) return jsonError("Observation was not accepted: invalid or outside coverage", 400);
  const submission = { ...parsed.data, approximatePoint };
  const windowStart = rateWindowStart(now);
  const [comboCount, ipCount] = await Promise.all([
    store.incrementRateLimit({ rateKey: requester.rateKey, windowStart, now }),
    store.incrementRateLimit({ rateKey: requester.ipRateKey, windowStart, now }),
  ]);
  if (comboCount > RATE_LIMIT_MAX_PER_HOUR || ipCount > IP_RATE_LIMIT_MAX_PER_HOUR) {
    return jsonError("Too many reports from this browser or network right now", 429);
  }

  const id = randomUUID();
  const expiresAt = addDaysIso(now, RETENTION_DAYS);
  await store.recordSubmission({ id, submission, requester, now, expiresAt });
  const headers = new Headers(COMMUNITY_HEADERS);
  if (!request.headers.get("Cookie")?.includes("firepoint_report_abuse=")) {
    headers.append("Set-Cookie", `firepoint_report_abuse=${randomUUID()}; Path=/; Max-Age=${RETENTION_DAYS * 86_400}; SameSite=Lax; HttpOnly; Secure`);
  }
  const receipt: SubmissionReceiptData = { receiptId: id, receivedAt: now, disposition: "awaiting-moderation", emergencyDispatch: false };
  return Response.json(receipt, { status: 202, headers });
}

function requireModerator(request: Request): Response | null {
  const token = process.env.FIREPOINT_MODERATOR_TOKEN?.trim();
  if (!token) return jsonError("Moderator workflow is not configured", 503);
  const header = request.headers.get("Authorization") ?? "";
  if (header !== `Bearer ${token}`) return jsonError("Moderator authorization required", 401);
  return null;
}

function configuredModeratorName(): string | null {
  return process.env.FIREPOINT_MODERATION_OWNER?.trim() || null;
}

export async function handleListPending(request: Request, store: ObservationStore): Promise<Response> {
  const auth = requireModerator(request);
  if (auth) return auth;
  if (!moderationConfigured()) return jsonError("Moderator owner and policy are not configured", 503);
  const rows = await store.listPending(50);
  return Response.json({ reports: rows, warning: "Moderator view only. Raw text and points must not be published." }, { status: 200, headers: COMMUNITY_HEADERS });
}

export async function handleModerateObservation(request: Request, store: ObservationStore, now = new Date().toISOString()): Promise<Response> {
  const auth = requireModerator(request);
  if (auth) return auth;
  if (!moderationConfigured()) return jsonError("Moderator owner and policy are not configured", 503);
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = ModerationDecisionSchema.safeParse(raw);
  if (!parsed.success) return jsonError("Invalid moderation decision", 400);
  const operatorName = configuredModeratorName();
  if (!operatorName || parsed.data.operatorName !== operatorName) {
    return jsonError("operatorName must match the configured moderation owner", 400);
  }
  const updated = await store.moderate({ ...parsed.data, operatorName, decidedAt: now });
  if (!updated) return jsonError("Report was not found or is no longer pending", 404);
  return Response.json({ reportId: updated.id, status: updated.status, operatorName, decidedAt: now }, { status: 200, headers: COMMUNITY_HEADERS });
}

export function moderationAttestation() {
  const ownerRole = process.env.FIREPOINT_MODERATION_OWNER?.trim();
  const policyVersion = process.env.FIREPOINT_MODERATION_POLICY_VERSION?.trim();
  const attestedAt = process.env.FIREPOINT_MODERATION_AT?.trim();
  if (!ownerRole || !policyVersion || !attestedAt) {
    return { status: "missing" as const, detail: "FIREPOINT_MODERATION_OWNER, FIREPOINT_MODERATION_POLICY_VERSION and FIREPOINT_MODERATION_AT are not configured" };
  }
  const parsed = z.iso.datetime({ offset: true }).safeParse(attestedAt);
  if (!parsed.success) return { status: "missing" as const, detail: "FIREPOINT_MODERATION_AT is not a valid ISO timestamp" };
  return { status: "attested" as const, queueId: "community-observations-preview", policyVersion, ownerRole, attestedAt: parsed.data };
}

export async function buildPublicAggregate(store: ObservationStore, now = new Date().toISOString()): Promise<ObservationAggregate> {
  const observations = await store.listApproved(now);
  const aggregate = aggregateObservations({
    now,
    config: AGGREGATION_CONFIG,
    moderation: moderationAttestation(),
    rightsReviewed: process.env.FIREPOINT_REPORT_RIGHTS_REVIEWED === "true",
    observations,
  }).aggregate;
  return ObservationAggregateSchema.parse(aggregate);
}

export async function handleGetAggregate(store: ObservationStore, now = new Date().toISOString()): Promise<Response> {
  const aggregate = await buildPublicAggregate(store, now);
  const status = aggregate.state === "published" ? 200 : 503;
  return Response.json(aggregate, { status, headers: COMMUNITY_HEADERS });
}

function requirePurgeToken(request: Request): Response | null {
  // Do not accept CRON_SECRET: Vercel Cron targets Production, not this Preview-only route.
  const token = process.env.FIREPOINT_PURGE_TOKEN?.trim();
  if (!token) return jsonError("Purge workflow is not configured", 503);
  const header = request.headers.get("Authorization") ?? "";
  if (header !== `Bearer ${token}`) return jsonError("Purge authorization required", 401);
  return null;
}

export async function handlePurgeExpired(request: Request, store: ObservationStore, now = new Date().toISOString()): Promise<Response> {
  const auth = requirePurgeToken(request);
  if (auth) return auth;
  const cleanup = await store.cleanupExpired(now);
  return Response.json({ ...cleanup, purgedAt: now }, { status: 200, headers: COMMUNITY_HEADERS });
}
