import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeFeedSchema } from "@/domain/contracts";
import { POST } from "./route";

const endpoint = "http://localhost/api/v1/notices/query";
const body = JSON.stringify({ point: [-118.25, 34.15], userInitiated: true });
function request(payload = body, contentType = "application/json") {
  return new Request(endpoint, { method: "POST", headers: { "Content-Type": contentType }, body: payload });
}
beforeEach(() => { vi.stubEnv("FIREPOINT_DEMO_LIVE_SOURCES", "enabled"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Firepoint point-query boundary", () => {
  it("does not contact publishers when public live queries are paused", async () => {
    vi.stubEnv("FIREPOINT_DEMO_LIVE_SOURCES", "");
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("paused") });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses invalid input without contacting an agency", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ point: [34.15, -118.25], userInitiated: true })))).status).toBe(400);
    expect((await POST(request(body, "text/plain"))).status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("reports missing server configuration as unavailable, never empty success", async () => {
    vi.stubEnv("NWS_USER_AGENT", "");
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const data = NoticeFeedSchema.parse(await response.json());
    expect(data.sourceChecks[0]?.status).toBe("not-configured");
    expect(data.notices).toEqual([]);
    expect(data.allClear).toBe(false);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns only actual publisher records from a synthetic upstream test response", async () => {
    vi.stubEnv("NWS_USER_AGENT", "Firepoint tests (test@example.org)");
    const stamp = "2026-09-26T10:00:00-07:00";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "FeatureCollection", features: [{
      type: "Feature", properties: { id: "synthetic-only", "@id": "https://api.weather.gov/alerts/synthetic-only",
        sent: stamp, updated: stamp, effective: stamp, expires: "2026-09-26T12:00:00-07:00",
        ends: "2026-09-26T13:00:00-07:00", event: "SYNTHETIC TEST ONLY", headline: "SYNTHETIC TEST ONLY", description: "SYNTHETIC TEST ONLY",
        instruction: null, areaDesc: "SYNTHETIC TEST ONLY", status: "Actual" },
    }] }))));
    const response = await POST(request());
    expect(response.status).toBe(200);
    const data = NoticeFeedSchema.parse(await response.json());
    expect(data.notices).toHaveLength(1);
    expect(data.notices[0]?.category).toBe("weather");
    expect(data.notices[0]?.endsAt).toBe("2026-09-26T13:00:00-07:00");
    expect(data.notices[0]?.origin.recordUrl).toBe("https://api.weather.gov/alerts/synthetic-only");
    expect(data.sourceChecks[0]?.endpoint).not.toContain("point=");
    expect(data.allClear).toBe(false);
  });
});
