import { describe, expect, it } from "vitest";
import { AIRNOW_ENDPOINT, airNowObservedAt, fetchAirNowObservations } from "./airnow";

const now = () => new Date("2026-09-26T12:00:00.000Z");
const point = [-118.25513, 34.14252] as const;
const apiKey = "SYNTHETIC-TEST-KEY";
// Deliberately synthetic fixture; never use it as live data or in the UI.
function row(overrides: Record<string, unknown> = {}) {
  return {
    DateObserved: "2026-09-26 ", HourObserved: 9, LocalTimeZone: "PST", ReportingArea: "Synthetic Area",
    StateCode: "CA", Latitude: 34.1, Longitude: -118.2, ParameterName: "PM2.5", AQI: 42,
    Category: { Number: 1, Name: "Good" }, ...overrides,
  };
}
function reply(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe("airNowObservedAt", () => {
  it("uses the zone label AirNow states and leaves unknown labels unknown", () => {
    expect(airNowObservedAt("2026-09-26 ", 9, "PST")).toBe("2026-09-26T17:00:00.000Z");
    expect(airNowObservedAt("2026-09-26", 9, "PDT")).toBe("2026-09-26T16:00:00.000Z");
    expect(airNowObservedAt("2026-09-26", 9, "XYZ")).toBeNull();
    expect(airNowObservedAt("26/09/2026", 9, "PST")).toBeNull();
  });
});

describe("fetchAirNowObservations", () => {
  it("sends only a snapped point and never exposes the key in the returned source URL", async () => {
    let requested = "";
    const result = await fetchAirNowObservations({ point, apiKey, now, fetcher: async (input) => {
      requested = String(input);
      return new Response(JSON.stringify([row()]));
    } });
    const url = new URL(requested);
    expect(url.searchParams.get("latitude")).toBe("34.1");
    expect(url.searchParams.get("longitude")).toBe("-118.3");
    expect(url.searchParams.get("API_KEY")).toBe(apiKey);
    expect(result.sourceUrl).toBe(AIRNOW_ENDPOINT);
    expect(JSON.stringify(result)).not.toContain(apiKey);
  });

  it("omits AirNow's negative no-data values instead of showing them as zero", async () => {
    const result = await fetchAirNowObservations({ point, apiKey, now, fetcher: reply([row(), row({ ParameterName: "O3", AQI: -1 })]) });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.observations).toEqual([{
      reportingArea: "Synthetic Area", stateCode: "CA", pollutant: "PM2.5", aqi: 42, category: "Good",
      observedAt: "2026-09-26T17:00:00.000Z",
    }]);
  });

  it("reports rejected keys and unexpected bodies as unavailable", async () => {
    expect(await fetchAirNowObservations({ point, apiKey, now, fetcher: reply({ message: "Invalid API key" }, 401) }))
      .toMatchObject({ status: "unavailable", reason: "http_error", httpStatus: 401 });
    expect(await fetchAirNowObservations({ point, apiKey, now, fetcher: reply({ WebServiceError: [{ Message: "bad" }] }) }))
      .toMatchObject({ status: "unavailable", reason: "invalid_response" });
  });

  it("refuses an unusable key before contacting AirNow", async () => {
    await expect(fetchAirNowObservations({ point, apiKey: "  ", now, fetcher: reply([]) })).rejects.toThrow(TypeError);
    await expect(fetchAirNowObservations({ point, apiKey: "a&b", now, fetcher: reply([]) })).rejects.toThrow(TypeError);
  });
});
