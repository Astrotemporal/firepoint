import { z } from "zod";
import type { StandingHazard } from "@/domain/contracts";
import { isoOrNull } from "./calfire";

/**
 * Hackathon-hosted Glendale GIS MCP (HackerFund/GlendaleGisMcp). It serves a dated
 * snapshot of regulatory hazard maps: never active fires, evacuations or a safety rating.
 */
export const GLENDALE_GIS_DEFAULT_URL = "https://glendale-gis-mcp-1053589358088.us-west2.run.app/mcp";
export const GLENDALE_GIS_PROJECT_URL = "https://github.com/HackerFund/GlendaleGisMcp";

export type GisFailure = "http_error" | "unauthorized" | "rate_limited" | "timeout" | "network_error" | "invalid_response" | "tool_error";

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
  | { status: "unavailable"; attemptedAt: string; reason: GisFailure; httpStatus?: number };

/** Extract the JSON-RPC reply from a JSON or text/event-stream body. */
export function parseRpcBody(body: string, contentType: string, id: number): unknown {
  if (!contentType.includes("text/event-stream")) return JSON.parse(body);
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
  timeoutMs?: number;
  now?: () => Date;
};

/** Mapped hazard designations at a point. Failures are explicit, never "not in a zone". */
export async function fetchGlendaleHazards({
  point, apiKey, url = GLENDALE_GIS_DEFAULT_URL, fetcher = fetch, timeoutMs = 10_000, now = () => new Date(),
}: FetchGisOptions): Promise<GisHazardsResult> {
  const key = apiKey.trim();
  if (!key || /[\r\n]/.test(key)) throw new TypeError("GLENDALE_GIS_MCP_KEY is not a usable key");
  if (!httpsUrl(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
    throw new TypeError("GLENDALE_GIS_MCP_URL must be HTTPS (or local HTTP for testing)");
  }
  const failed = (reason: GisFailure, httpStatus?: number): GisHazardsResult => ({
    status: "unavailable", attemptedAt: now().toISOString(), reason, ...(httpStatus !== undefined ? { httpStatus } : {}),
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
    });
    if (response.status === 401 || response.status === 403) return failed("unauthorized", response.status);
    if (response.status === 429) return failed("rate_limited", 429);
    if (!response.ok) return failed("http_error", response.status);
    const reply = rpcReplySchema.safeParse(parseRpcBody(await response.text(), response.headers.get("content-type") ?? "", id));
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
