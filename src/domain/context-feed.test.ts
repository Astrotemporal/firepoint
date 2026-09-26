import { describe, expect, it } from "vitest";
import { buildContextFeed } from "./context-feed";
import type { CalFireResult } from "@/server/calfire";
import type { NifcResult } from "@/server/nifc";

const checkedAt = "2026-09-26T12:00:00.000Z";
const point = [-118.2551, 34.1425] as const;
// Deliberately synthetic fixtures; never use them as live data or in the UI.
const incident = (id: string, lon: number, lat: number) => ({
  id, name: `SYNTHETIC ${id}`, point: [lon, lat] as [number, number], incidentType: "Wildfire", county: null,
  locationDescription: null, acresBurned: 5, percentContained: null, startedAt: null, updatedAt: null,
  url: "https://www.fire.ca.gov/incidents",
});
const calfire: CalFireResult = {
  status: "ok", sourceUrl: "https://incidents.fire.ca.gov/", checkedAt,
  incidents: [incident("far", -121.7, 36.2), incident("near", -118.3, 34.2), incident("closest", -118.26, 34.15)],
};
const nifcDown: NifcResult = { status: "unavailable", sourceUrl: "https://services3.arcgis.com/", attemptedAt: checkedAt, reason: "timeout" };

describe("buildContextFeed", () => {
  it("keeps nearby incidents only, closest first, with distance and caveat", () => {
    const feed = buildContextFeed({ point, radiusKm: 80, generatedAt: checkedAt, calfire, nifc: nifcDown, airnow: "not-configured" });
    expect(feed.incidents.map((item) => item.name)).toEqual(["SYNTHETIC closest", "SYNTHETIC near"]);
    expect(feed.incidents[0]?.distanceKm).toBeLessThan(2);
    expect(feed.incidents[0]?.caveat).toMatch(/not an evacuation order/i);
    expect(feed.allClear).toBe(false);
  });

  it("gives every source its own check so an outage is never read as nothing nearby", () => {
    const feed = buildContextFeed({ point, radiusKm: 80, generatedAt: checkedAt, calfire, nifc: nifcDown, airnow: "not-configured" });
    expect(feed.sourceChecks.map((check) => [check.sourceKey, check.status])).toEqual([
      ["calfire-incidents", "ok"],
      ["nifc-current-perimeters", "down"],
      ["airnow-current-observations", "not-configured"],
    ]);
    expect(feed.sourceChecks[1]?.detail).toMatch(/timeout/);
    expect(feed.sourceChecks[1]?.lastSuccessAt).toBeNull();
    expect(feed.perimeters).toEqual([]);
    for (const check of feed.sourceChecks) expect(check.endpoint).not.toContain("API_KEY");
  });

  it("sorts air quality by the highest reading and keeps it marked preliminary", () => {
    const feed = buildContextFeed({
      point, radiusKm: 80, generatedAt: checkedAt, calfire, nifc: nifcDown,
      airnow: { status: "ok", sourceUrl: "https://www.airnowapi.org/", checkedAt, observations: [
        { reportingArea: "Synthetic", stateCode: "CA", pollutant: "O3", aqi: 30, category: "Good", observedAt: null },
        { reportingArea: "Synthetic", stateCode: "CA", pollutant: "PM2.5", aqi: 88, category: "Moderate", observedAt: null },
      ] },
    });
    expect(feed.airQuality.map((row) => row.aqi)).toEqual([88, 30]);
    expect(feed.airQuality[0]?.preliminary).toBe(true);
    expect(feed.airQuality[0]?.reportingArea).toBe("Synthetic, CA");
  });
});
