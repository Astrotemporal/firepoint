import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startGisStub, STUB_OVERSIZE_BYTES, type GisStub } from "../../scripts/gis-mcp-stub.mjs";
import { fetchGlendaleHazards, GIS_MAX_RESPONSE_BYTES } from "./glendale-gis";

/**
 * End-to-end over a real loopback socket with Node's own fetch, so the streaming bound,
 * redirect refusal and timeout are exercised as they run in a Node function, not through an
 * injected Response. The stub is synthetic; nothing here touches the hosted MCP or a real key.
 */
let stub: GisStub;
const point = [-118.25, 34.15] as const;
const now = () => new Date("2026-09-26T12:00:00.000Z");
const call = (path: string, extra: Partial<Parameters<typeof fetchGlendaleHazards>[0]> = {}) =>
  fetchGlendaleHazards({ point, apiKey: stub.key, url: `${stub.baseUrl}${path}`, now, ...extra });

beforeAll(async () => { stub = await startGisStub({ port: 0 }); });
afterAll(async () => { await stub.close(); });
afterEach(() => { stub.requests.length = 0; });

describe("adapter against the synthetic loopback stub", () => {
  it("makes exactly one authorized tools/call and maps the synthetic reply", async () => {
    const result = await call("/mcp");
    expect(stub.requests).toEqual([{ method: "POST", path: "/mcp", authorized: true, bodyBytes: expect.any(Number) }]);
    expect(stub.requests[0]?.bodyBytes).toBeLessThan(256);
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.reason}`);
    expect(result.hazards).toHaveLength(7);
    expect(result.hazards.every((h) => h.dataset.startsWith("SYNTHETIC"))).toBe(true);
    expect(result.hazards[0]).toMatchObject({ hazard: "wildfire", lookup: "inside", classification: "SYNTHETIC CLASS" });
    expect(result.hazards[6]).toMatchObject({ hazard: "debris-flow", lookup: "unavailable", coverage: "unknown" });
  });

  it("accepts a plain application/json reply too", async () => {
    expect((await call("/mcp?format=json")).status).toBe("ok");
  });

  it("refuses to follow a redirect, so the key never leaves the configured origin", async () => {
    const result = await call("/mcp/redirect");
    expect(result).toMatchObject({ status: "unavailable", reason: "redirected", httpStatus: 302 });
    expect(stub.requests.map((r) => r.path)).toEqual(["/mcp/redirect"]);
  });

  it("rejects an unexpected content type before parsing", async () => {
    expect(await call("/mcp/html")).toMatchObject({ status: "unavailable", reason: "bad_content_type", httpStatus: 200 });
  });

  it("stops reading a chunked body once it passes the byte bound", async () => {
    expect(STUB_OVERSIZE_BYTES).toBeGreaterThan(GIS_MAX_RESPONSE_BYTES);
    const started = Date.now();
    expect(await call("/mcp/oversize")).toMatchObject({ status: "unavailable", reason: "oversize" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("refuses a declared oversize Content-Length without waiting for the body", async () => {
    const started = Date.now();
    expect(await call("/mcp/oversize-declared", { timeoutMs: 5_000 })).toMatchObject({ reason: "oversize" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("honours a smaller caller-supplied bound", async () => {
    expect(await call("/mcp", { maxResponseBytes: 64 })).toMatchObject({ reason: "oversize" });
  });

  it("times out whether the server withholds headers or stalls mid-body", async () => {
    expect(await call("/mcp/hang", { timeoutMs: 300 })).toMatchObject({ status: "unavailable", reason: "timeout" });
    expect(await call("/mcp/slow-body", { timeoutMs: 300 })).toMatchObject({ status: "unavailable", reason: "timeout" });
  });

  it("names 401, 429 with Retry-After, tool errors and a mismatched reply id", async () => {
    expect(await fetchGlendaleHazards({ point, apiKey: "SYNTHETIC-WRONG-KEY", url: stub.mcpUrl, now }))
      .toMatchObject({ reason: "unauthorized", httpStatus: 401 });
    expect(await call("/mcp/rate-limited")).toMatchObject({ reason: "rate_limited", httpStatus: 429, retryAfterSeconds: 30 });
    expect(await call("/mcp/tool-error")).toMatchObject({ reason: "tool_error" });
    expect(await call("/mcp/wrong-id")).toMatchObject({ reason: "invalid_response" });
  });

  it("reports a closed port as a network error, never as no hazards", async () => {
    const closed = await startGisStub({ port: 0 });
    const url = closed.mcpUrl;
    await closed.close();
    expect(await fetchGlendaleHazards({ point, apiKey: stub.key, url, now })).toMatchObject({ status: "unavailable", reason: "network_error" });
  });
});
