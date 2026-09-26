import { describe, expect, it } from "vitest";
import { CALFIRE_INCIDENTS_URL, fetchCalFireIncidents } from "./calfire";

const now = () => new Date("2026-09-26T12:00:00.000Z");
// Deliberately synthetic fixture; never use it as live data or in the UI.
function feature(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-118.2, 34.2] },
    properties: {
      UniqueId: "synthetic-incident", Name: " SYNTHETIC TEST FIRE ", Updated: "2026-09-26T11:00:00Z",
      Started: "2026-09-25T20:00:00Z", County: "Synthetic", Location: "Synthetic location", Type: "Wildfire",
      Url: "https://www.fire.ca.gov/incidents/synthetic/", AcresBurned: 12.5, PercentContained: 40,
      IsActive: true, Final: false, ...overrides,
    },
  };
}
function reply(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe("fetchCalFireIncidents", () => {
  it("requests the statewide list without any resident location", async () => {
    let requested = "";
    await fetchCalFireIncidents({ now, fetcher: async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }));
    } });
    expect(requested).toBe(CALFIRE_INCIDENTS_URL);
  });

  it("keeps publisher fields and drops inactive or final records", async () => {
    const result = await fetchCalFireIncidents({ now, fetcher: reply({ type: "FeatureCollection", features: [
      feature(), feature({ UniqueId: "ended", IsActive: false }), feature({ UniqueId: "final", Final: true }),
    ] }) });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0]).toMatchObject({
      id: "synthetic-incident", name: "SYNTHETIC TEST FIRE", point: [-118.2, 34.2],
      percentContained: 40, updatedAt: "2026-09-26T11:00:00.000Z",
    });
  });

  it("leaves unparseable times unknown and replaces off-site links with the incident index", async () => {
    const result = await fetchCalFireIncidents({ now, fetcher: reply({ type: "FeatureCollection", features: [
      feature({ Updated: "not a time", Started: "", Url: "https://example.com/phish" }),
    ] }) });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.incidents[0]?.updatedAt).toBeNull();
    expect(result.incidents[0]?.startedAt).toBeNull();
    expect(result.incidents[0]?.url).toBe("https://www.fire.ca.gov/incidents");
  });

  it("reports HTTP errors, schema drift and network failures as unavailable", async () => {
    expect(await fetchCalFireIncidents({ now, fetcher: reply({}, 500) })).toMatchObject({ status: "unavailable", reason: "http_error", httpStatus: 500 });
    expect(await fetchCalFireIncidents({ now, fetcher: reply({ type: "FeatureCollection", features: [feature({ Name: 7 })] }) }))
      .toMatchObject({ status: "unavailable", reason: "invalid_response" });
    expect(await fetchCalFireIncidents({ now, fetcher: async () => { throw new TypeError("offline"); } }))
      .toMatchObject({ status: "unavailable", reason: "network_error" });
  });

  it("times out instead of waiting indefinitely", async () => {
    const result = await fetchCalFireIncidents({ now, timeoutMs: 5, fetcher: () => new Promise<Response>(() => {}) });
    expect(result).toMatchObject({ status: "unavailable", reason: "timeout" });
  });
});
