import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextFeedSchema } from "@/domain/contracts";
import { POST } from "./route";

const endpoint = "http://localhost/api/v1/context/query";
const body = JSON.stringify({ point: [-118.25, 34.15], userInitiated: true });
function request(payload = body, contentType = "application/json") {
  return new Request(endpoint, { method: "POST", headers: { "Content-Type": contentType }, body: payload });
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

// Deliberately synthetic upstream responses, routed by publisher host.
function upstream(overrides: Partial<Record<"calfire" | "nifc" | "airnow", Response>> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("fire.ca.gov")) return overrides.calfire ?? new Response(JSON.stringify({ type: "FeatureCollection", features: [{
      type: "Feature", geometry: { type: "Point", coordinates: [-118.26, 34.16] },
      properties: { UniqueId: "synthetic", Name: "SYNTHETIC TEST ONLY", IsActive: true, Final: false, Url: "https://www.fire.ca.gov/incidents/x/" },
    }] }));
    if (url.includes("arcgis.com")) return overrides.nifc ?? new Response(JSON.stringify({ type: "FeatureCollection", features: [] }));
    if (url.includes("airnowapi.org")) return overrides.airnow ?? new Response(JSON.stringify([]));
    throw new Error(`unexpected upstream ${url}`);
  });
}

describe("fire and air context route", () => {
  it("refuses invalid input without contacting any publisher", async () => {
    const fetcher = upstream(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ point: [-118.25, 34.15] })))).status).toBe(400);
    expect((await POST(request(body, "text/plain"))).status).toBe(415);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports each source separately and never calls AirNow without a key", async () => {
    vi.stubEnv("AIRNOW_API_KEY", "");
    const fetcher = upstream(); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const feed = ContextFeedSchema.parse(await response.json());
    expect(feed.incidents).toHaveLength(1);
    expect(feed.sourceChecks.map((check) => check.status)).toEqual(["ok", "ok", "not-configured"]);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("airnowapi.org"))).toBe(false);
    expect(feed.allClear).toBe(false);
  });

  it("keeps working data when another source fails, and never leaks the AirNow key", async () => {
    vi.stubEnv("AIRNOW_API_KEY", "SYNTHETIC-SECRET");
    vi.stubGlobal("fetch", upstream({ nifc: new Response("{}", { status: 500 }) }));
    const response = await POST(request());
    const raw = await response.text();
    expect(raw).not.toContain("SYNTHETIC-SECRET");
    const feed = ContextFeedSchema.parse(JSON.parse(raw));
    expect(feed.sourceChecks.map((check) => check.status)).toEqual(["ok", "down", "ok"]);
    expect(feed.incidents).toHaveLength(1);
  });

  it("answers 503 when no source could be checked", async () => {
    vi.stubEnv("AIRNOW_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const response = await POST(request());
    expect(response.status).toBe(503);
    const feed = ContextFeedSchema.parse(await response.json());
    expect(feed.incidents).toEqual([]);
    expect(feed.sourceChecks.every((check) => check.status !== "ok")).toBe(true);
  });
});
