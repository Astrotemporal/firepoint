import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StandingHazardFeedSchema } from "@/domain/contracts";
import { POST } from "./route";

const body = JSON.stringify({ point: [-118.25, 34.15], userInitiated: true });
function request(payload = body) {
  return new Request("http://localhost/api/v1/hazards/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
}
beforeEach(() => { vi.stubEnv("FIREPOINT_DEMO_LIVE_SOURCES", "enabled"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("standing hazard route", () => {
  it("does not contact publishers when public live queries are paused", async () => {
    vi.stubEnv("FIREPOINT_DEMO_LIVE_SOURCES", "");
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("paused") });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("stays paused in a production build even when the demo flag and a key are set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GLENDALE_GIS_MCP_KEY", "SYNTHETIC-SECRET");
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("paused") });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses invalid input without contacting the GIS server", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    expect((await POST(request("{}"))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("requires the explicit user-action flag, and rejects oversize or non-JSON bodies", async () => {
    vi.stubEnv("GLENDALE_GIS_MCP_KEY", "SYNTHETIC-SECRET");
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    expect((await POST(request(JSON.stringify({ point: [-118.25, 34.15], userInitiated: false })))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ point: [-118.25, 34.15] })))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ point: [-118.25, 34.15], userInitiated: true, pad: "x".repeat(1024) })))).status).toBe(413);
    const plain = new Request("http://localhost/api/v1/hazards/query", { method: "POST", headers: { "Content-Type": "text/plain" }, body });
    expect((await POST(plain)).status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("reports redirects, oversize and wrong-type replies as down, never as no hazards", async () => {
    vi.stubEnv("GLENDALE_GIS_MCP_KEY", "SYNTHETIC-SECRET");
    const cases: Array<[Response, RegExp]> = [
      [new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }), /redirect/],
      [new Response("{}", { headers: { "content-type": "application/json", "content-length": String(2 * 1024 * 1024) } }), /larger/],
      [new Response("<html>", { headers: { "content-type": "text/html" } }), /content type/],
    ];
    for (const [upstreamReply, detail] of cases) {
      const upstream = vi.fn(async () => upstreamReply); vi.stubGlobal("fetch", upstream);
      const response = await POST(request());
      expect(response.status).toBe(503);
      const feed = StandingHazardFeedSchema.parse(await response.json());
      expect(feed.sourceChecks[0]).toMatchObject({ status: "down", lastSuccessAt: null });
      expect(feed.sourceChecks[0]?.detail).toMatch(detail);
      expect(feed.hazards).toEqual([]);
      expect(feed.allClear).toBe(false);
      expect(upstream).toHaveBeenCalledTimes(1);
    }
  });

  it("forwards the point to the configured local stub URL only through the server", async () => {
    vi.stubEnv("GLENDALE_GIS_MCP_KEY", "SYNTHETIC-SECRET");
    vi.stubEnv("GLENDALE_GIS_MCP_URL", "http://127.0.0.1:8765/mcp");
    const upstream = vi.fn(async () => new Response("", { status: 503 })); vi.stubGlobal("fetch", upstream);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8765/mcp");
    expect(init.redirect).toBe("manual");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer SYNTHETIC-SECRET");
  });

  it("reports a missing key as not configured, never as no hazards", async () => {
    vi.stubEnv("GLENDALE_GIS_MCP_KEY", "");
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const response = await POST(request());
    expect(response.status).toBe(503);
    const feed = StandingHazardFeedSchema.parse(await response.json());
    expect(feed.sourceChecks[0]?.status).toBe("not-configured");
    expect(feed.hazards).toEqual([]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("explains a rejected key and never echoes it", async () => {
    vi.stubEnv("GLENDALE_GIS_MCP_KEY", "SYNTHETIC-SECRET");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const response = await POST(request());
    const raw = await response.text();
    expect(response.status).toBe(503);
    expect(raw).not.toContain("SYNTHETIC-SECRET");
    const feed = StandingHazardFeedSchema.parse(JSON.parse(raw));
    expect(feed.sourceChecks[0]).toMatchObject({ status: "down", lastSuccessAt: null });
    expect(feed.sourceChecks[0]?.detail).toMatch(/rejected/);
  });
});
