import { z } from "zod";
import type { StandingHazard } from "@/domain/contracts";
import { isoOrNull } from "./calfire";

/**
 * Hackathon-hosted Glendale GIS MCP (HackerFund/GlendaleGisMcp). It serves a dated
 * snapshot of regulatory hazard maps: never active fires, evacuations or a safety rating.
 */
export const GLENDALE_GIS_DEFAULT_URL = "https://glendale-gis-mcp-1053589358088.us-west2.run.app/mcp";
export const GLENDALE_GIS_PROJECT_URL = "https://github.com/HackerFund/GlendaleGisMcp";

export type GisFailure =
  | "http_error" | "unauthorized" | "rate_limited" | "timeout" | "network_error" | "invalid_response" | "tool_error"
  | "redirected" | "bad_content_type" | "oversize";

/**
 * Bounds on one adapter call. The request is one fixed `tools/call` (about 150 bytes); the
 * reply is seven hazard layers with nearest-zone attributes, tens of kilobytes in the pinned
 * upstream (59beb340). 1 MiB leaves an order of magnitude of headroom while keeping a broken
 * or hostile upstream from filling a serverless function's memory. Reads stop at the limit.
 */
export const GIS_MAX_RESPONSE_BYTES = 1024 * 1024;
export const GIS_DEFAULT_TIMEOUT_MS = 10_000;
const ACCEPTED_CONTENT_TYPES = ["application/json", "text/event-stream"] as const;

const text = z.string().nullable().optional();
const layerSchema = z.object({
  dataset: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["in_zone", "not_in_zone", "unavailable"]),
  reason: text,
  class_field: text,
  matches: z.array(z.object({
    attributes: z.record(z.string(), z.unknown()),
    ref: z.object({ object_id: z.union([z.number(), z.string()]).nullable().optional(), layer_url: text }).optional(),
  })).nullable().optional(),
  notes: z.array(z.string()).nullable().optional(),
  disclaimer: text,
  _meta: z.object({
    source: text, url: text, as_of: text, stale: z.boolean().nullable().optional(), source_last_edit: text,
  }).nullable().optional(),
});
type Layer = z.infer<typeof layerSchema>;

/** Response keys from `hazards_at_location`, mapped to Firepoint hazard names. */
const LAYERS = {
  wildfire: "wildfire", flood: "flood", fault: "fault-rupture", liquefaction: "liquefaction",
  landslide: "landslide", dam_inundation: "dam-inundation", debris_flow: "debris-flow",
} as const satisfies Record<string, StandingHazard["hazard"]>;

const hazardsSchema = z.object({
  location: z.object({ in_city: z.boolean().nullable().optional() }).passthrough(),
  ...Object.fromEntries(Object.keys(LAYERS).map((key) => [key, layerSchema])) as { [K in keyof typeof LAYERS]: typeof layerSchema },
});

export type GisHazardsResult =
  | { status: "ok"; checkedAt: string; snapshotAsOf: string | null; anyStale: boolean; inCity: boolean | null; hazards: StandingHazard[] }
  | { status: "unavailable"; attemptedAt: string; reason: GisFailure; httpStatus?: number; retryAfterSeconds?: number };

/** Extract the JSON-RPC reply from a JSON or text/event-stream body. */
export function parseRpcBody(body: string, contentType: string, id: number): unknown {
  if (!contentType.includes("text/event-stream")) {
    const message: unknown = JSON.parse(body);
    if (typeof message !== "object" || message === null || (message as { id?: unknown }).id !== id) {
      throw new SyntaxError("JSON-RPC reply id does not match the request");
    }
    return message;
  }
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) continue;
    const message: unknown = JSON.parse(data);
    if (typeof message === "object" && message !== null && (message as { id?: unknown }).id === id) return message;
  }
  throw new SyntaxError("No JSON-RPC reply in event stream");
}

const rpcReplySchema = z.union([
  z.object({ result: z.object({
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    structuredContent: z.unknown().optional(),
    isError: z.boolean().optional(),
  }) }),
  z.object({ error: z.object({ message: z.string().optional() }).passthrough() }),
]);

/** Media type without parameters, lower-cased: "text/event-stream; charset=utf-8" -> "text/event-stream". */
export function mediaType(contentType: string | null): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export type BoundedRead = { ok: true; text: string } | { ok: false; reason: "oversize" | "aborted" };

/**
 * Read a response body as UTF-8 text, stopping as soon as it exceeds `maxBytes`. A declared
 * Content-Length above the limit is refused before any byte is read; an undeclared or lying
 * length is caught while streaming, and the remaining body is cancelled, not drained.
 */
export async function readBounded(response: Response, maxBytes: number, signal?: AbortSignal): Promise<BoundedRead> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "oversize" };
  if (!response.body) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength > maxBytes ? { ok: false, reason: "oversize" } : { ok: true, text };
  }
  const reader = response.body.getReader();
  const cancel = () => { reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8");
  let received = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal?.aborted) return { ok: false, reason: "aborted" };
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) { cancel(); return { ok: false, reason: "oversize" }; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = Number(response.headers.get("retry-after"));
  return Number.isInteger(value) && value > 0 && value <= 3600 ? value : undefined;
}

function httpsUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function classification(layer: Layer): string | null {
  const match = layer.matches?.[0]?.attributes;
  if (!match) return null;
  const value = layer.class_field ? match[layer.class_field] : undefined;
  const base = typeof value === "string" || typeof value === "number" ? String(value) : null;
  if (layer.dataset === "fema_flood_zones" && base && typeof match.ZONE_SUBTY === "string") {
    return `Zone ${base} (${match.ZONE_SUBTY.toLowerCase()})`;
  }
  if (!base && typeof match.DamName === "string") return match.DamName;
  return base;
}

function toStandingHazard(hazard: StandingHazard["hazard"], layer: Layer, checkedAt: string): StandingHazard {
  const unavailable = layer.status === "unavailable";
  const ids = (layer.matches ?? []).map((m) => m.ref?.object_id).filter((id) => id !== null && id !== undefined);
  // Notes about raw attribute fields are developer guidance, not resident guidance.
  const notes = (layer.notes ?? []).filter((note) => !/attributes describe/i.test(note));
  const caveat = [...notes, layer.disclaimer ?? "", unavailable && layer.reason ? `Unavailable: ${layer.reason}` : ""]
    .map((part) => part.trim()).filter(Boolean).join(" ")
    || "Regulatory hazard map, not a site-specific assessment or current conditions.";
  return {
    kind: "standing-hazard",
    hazard,
    dataset: layer.title,
    classification: unavailable ? null : classification(layer),
    lookup: unavailable ? "unavailable" : layer.status === "in_zone" ? "inside" : "outside",
    coverage: !unavailable ? "verified" : /outside|cover|area|extent|bound/i.test(layer.reason ?? "") ? "out-of-bounds" : "unknown",
    caveat,
    origin: {
      operator: "Glendale GIS MCP (Hacker Fund)",
      issuer: layer._meta?.source?.trim() || null,
      recordId: `${layer.dataset}:${ids.length ? ids.join(",") : "none"}`,
      recordUrl: httpsUrl(layer.matches?.[0]?.ref?.layer_url) ?? httpsUrl(layer._meta?.url) ?? GLENDALE_GIS_PROJECT_URL,
      retrievedAt: checkedAt,
      issuedAt: null,
      updatedAt: isoOrNull(layer._meta?.source_last_edit),
    },
  };
}

export type FetchGisOptions = {
  point: readonly [number, number];
  apiKey: string;
  url?: string;
  fetcher?: typeof fetch;
  /** Whole-call budget: connect, headers and body read. */
  timeoutMs?: number;
  /** Upper bound on the reply body in bytes; larger replies are `oversize`, never partially parsed. */
  maxResponseBytes?: number;
  now?: () => Date;
};

/**
 * Mapped hazard designations at a point. Failures are explicit, never "not in a zone".
 * Exactly one upstream request is made: redirects are refused rather than followed, so the
 * bearer key only ever goes to the configured origin.
 */
export async function fetchGlendaleHazards({
  point, apiKey, url = GLENDALE_GIS_DEFAULT_URL, fetcher = fetch, timeoutMs = GIS_DEFAULT_TIMEOUT_MS,
  maxResponseBytes = GIS_MAX_RESPONSE_BYTES, now = () => new Date(),
}: FetchGisOptions): Promise<GisHazardsResult> {
  const key = apiKey.trim();
  if (!key || /[\r\n]/.test(key)) throw new TypeError("GLENDALE_GIS_MCP_KEY is not a usable key");
  if (!httpsUrl(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
    throw new TypeError("GLENDALE_GIS_MCP_URL must be HTTPS (or local HTTP for testing)");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("timeoutMs must be a positive integer");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) throw new RangeError("maxResponseBytes must be a positive integer");
  const failed = (reason: GisFailure, extra: { httpStatus?: number; retryAfterSeconds?: number } = {}): GisHazardsResult => ({
    status: "unavailable", attemptedAt: now().toISOString(), reason,
    ...(extra.httpStatus !== undefined ? { httpStatus: extra.httpStatus } : {}),
    ...(extra.retryAfterSeconds !== undefined ? { retryAfterSeconds: extra.retryAfterSeconds } : {}),
  });
  const id = 1;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    // The hosted server is stateless streamable HTTP, so one tools/call needs no session.
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id, method: "tools/call",
        params: { name: "hazards_at_location", arguments: { location: { lat: point[1], lon: point[0] } } },
      }),
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual",
    });
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      return failed("redirected", { httpStatus: response.status || undefined });
    }
    if (response.status === 401 || response.status === 403) return failed("unauthorized", { httpStatus: response.status });
    if (response.status === 429) return failed("rate_limited", { httpStatus: 429, retryAfterSeconds: retryAfterSeconds(response) });
    if (!response.ok) return failed("http_error", { httpStatus: response.status });
    const contentType = response.headers.get("content-type");
    if (!(ACCEPTED_CONTENT_TYPES as readonly string[]).includes(mediaType(contentType))) {
      return failed("bad_content_type", { httpStatus: response.status });
    }
    const body = await readBounded(response, maxResponseBytes, controller.signal);
    if (!body.ok) return failed(body.reason === "oversize" ? "oversize" : "timeout", { httpStatus: response.status });
    const reply = rpcReplySchema.safeParse(parseRpcBody(body.text, mediaType(contentType), id));
    if (!reply.success) return failed("invalid_response");
    if ("error" in reply.data || reply.data.result.isError) return failed("tool_error");
    const { result } = reply.data;
    const payload = result.structuredContent ?? JSON.parse(result.content?.find((part) => part.type === "text")?.text ?? "null");
    const parsed = hazardsSchema.safeParse(payload);
    if (!parsed.success) return failed("invalid_response");
    const checkedAt = now().toISOString();
    const layers = Object.entries(LAYERS).map(([key, hazard]) => ({ hazard, layer: parsed.data[key as keyof typeof LAYERS] }));
    const asOf = layers.map(({ layer }) => isoOrNull(layer._meta?.as_of)).filter((v): v is string => v !== null).sort();
    return {
      status: "ok",
      checkedAt,
      snapshotAsOf: asOf[0] ?? null,
      anyStale: layers.some(({ layer }) => layer._meta?.stale === true),
      inCity: parsed.data.location.in_city ?? null,
      hazards: layers.map(({ hazard, layer }) => toStandingHazard(hazard, layer, checkedAt)),
    };
  } catch (error) {
    return failed(timedOut ? "timeout" : error instanceof SyntaxError ? "invalid_response" : "network_error");
  } finally {
    clearTimeout(timer);
  }
}
