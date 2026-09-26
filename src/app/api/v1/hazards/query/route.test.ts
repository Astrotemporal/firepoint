import { afterEach, describe, expect, it, vi } from "vitest";
import { StandingHazardFeedSchema } from "@/domain/contracts";
import { POST } from "./route";

const body = JSON.stringify({ point: [-118.25, 34.15], userInitiated: true });
function request(payload = body) {
  return new Request("http://localhost/api/v1/hazards/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("standing hazard route", () => {
  it("refuses invalid input without contacting the GIS server", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    expect((await POST(request("{}"))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
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
