import { describe, expect, it } from "vitest";
import { fetchNwsActiveAlerts } from "./nws";

const userAgent = "Firepoint/0.1 (contact: test@example.org)";
const now = () => new Date("2026-09-26T12:00:00.000Z");
const point = { latitude: 34.1425, longitude: -118.2551, userAgent, now };

// Deliberately synthetic fixture; never use it as live data or in the UI.
const sample = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: {
      id: "urn:oid:synthetic.test.alert",
      "@id": "https://api.weather.gov/alerts/urn:oid:synthetic.test.alert",
      sent: "2026-09-26T10:00:00-07:00",
      updated: "2026-09-26T10:02:00-07:00",
      effective: "2026-09-26T10:01:00-07:00",
      status: "Actual",
      expires: "2026-09-26T12:00:00-07:00",
      event: "Test warning",
      headline: "Synthetic alert headline",
      description: "Synthetic description",
      instruction: "Synthetic instruction",
      areaDesc: "Synthetic area",
    },
  }],
};
function reply(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe("fetchNwsActiveAlerts", () => {
  it("requests NWS's point-filtered feed with an identifying server-side User-Agent", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const result = await fetchNwsActiveAlerts({
      ...point,
      fetcher: async (input, init) => {
        requestedUrl = String(input);
        requestedInit = init;
        return new Response(JSON.stringify(sample));
      },
    });
    expect(requestedUrl).toBe("https://api.weather.gov/alerts/active?point=34.1425%2C-118.2551");
    expect(requestedInit?.headers).toEqual({ Accept: "application/geo+json", "User-Agent": userAgent });
    expect(requestedInit?.cache).toBe("no-store");
    expect(result).toEqual({
      status: "ok", sourceUrl: requestedUrl, checkedAt: "2026-09-26T12:00:00.000Z",
      pointFiltered: true,
      alerts: [{
        id: "urn:oid:synthetic.test.alert",
        url: "https://api.weather.gov/alerts/urn:oid:synthetic.test.alert",
        sent: "2026-09-26T10:00:00-07:00",
        updated: "2026-09-26T10:02:00-07:00",
        effective: "2026-09-26T10:01:00-07:00",
        status: "Actual",
        expires: "2026-09-26T12:00:00-07:00",
        event: "Test warning",
        headline: "Synthetic alert headline",
        description: "Synthetic description",
        instruction: "Synthetic instruction",
        areaDesc: "Synthetic area",
      }],
    });
  });

  it("preserves nullable headline and instruction and treats a valid empty collection as zero returned, not safe", async () => {
    const nullable = structuredClone(sample);
    nullable.features[0]!.properties.headline = null as unknown as string;
    nullable.features[0]!.properties.instruction = null as unknown as string;
    const result = await fetchNwsActiveAlerts({ ...point, fetcher: reply(nullable) });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.alerts[0]).toMatchObject({ headline: null, instruction: null });
    const empty = await fetchNwsActiveAlerts({ ...point, fetcher: reply({ type: "FeatureCollection", features: [] }) });
    expect(empty.status).toBe("ok");
    if (empty.status === "ok") expect(empty.alerts).toEqual([]);
  });

  it.each([400, 404, 429, 500, 503])("marks HTTP %i unavailable without creating alerts", async (status) => {
    const result = await fetchNwsActiveAlerts({ ...point, fetcher: reply({ message: "error" }, status) });
    expect(result).toMatchObject({ status: "unavailable", reason: "http_error", httpStatus: status, pointFiltered: true });
    expect(result).not.toHaveProperty("alerts");
    expect(result).toHaveProperty("attemptedAt", "2026-09-26T12:00:00.000Z");
    expect(result).not.toHaveProperty("checkedAt");
  });

  it("rejects malformed upstream records and invalid JSON", async () => {
    for (const body of [
      { type: "FeatureCollection", features: [{ type: "Feature", properties: { ...sample.features[0]!.properties, expires: "bad date" } }] },
      { type: "FeatureCollection", features: [{ type: "Feature", properties: { ...sample.features[0]!.properties, "@id": "not a URL" } }] },
      { type: "FeatureCollection", features: [{ type: "Feature", properties: { ...sample.features[0]!.properties, "@id": "https://example.org/fake" } }] },
      { type: "FeatureCollection", features: "not an array" },
    ]) {
      const result = await fetchNwsActiveAlerts({ ...point, fetcher: reply(body) });
      expect(result).toMatchObject({ status: "unavailable", reason: "invalid_response" });
      expect(result).not.toHaveProperty("alerts");
    }
    const invalidJson = await fetchNwsActiveAlerts({ ...point, fetcher: async () => new Response("not JSON") });
    expect(invalidJson).toMatchObject({ status: "unavailable", reason: "invalid_response" });
  });

  it("handles fetch failures and bounded timeouts without fake empty data", async () => {
    const failure = await fetchNwsActiveAlerts({ ...point, fetcher: async () => { throw new Error("disconnected"); } });
    expect(failure).toMatchObject({ status: "unavailable", reason: "network_error" });
    expect(failure).not.toHaveProperty("alerts");
    const timeout = await fetchNwsActiveAlerts({
      ...point, timeoutMs: 20,
      fetcher: async () => new Promise<Response>(() => {}),
    });
    expect(timeout).toMatchObject({ status: "unavailable", reason: "timeout" });
    expect(timeout).not.toHaveProperty("alerts");
  });

  it("rejects invalid points and absent contact identity before a network request", async () => {
    const never: typeof fetch = async () => { throw new Error("network should not be used"); };
    await expect(fetchNwsActiveAlerts({ ...point, latitude: 91, fetcher: never })).rejects.toThrow(RangeError);
    await expect(fetchNwsActiveAlerts({ ...point, userAgent: "generic", fetcher: never })).rejects.toThrow(TypeError);
  });
});
