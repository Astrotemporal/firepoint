import { describe, expect, it } from "vitest";
import { fetchNifcPerimeters, NIFC_LAYER_URL, searchEnvelope } from "./nifc";

const now = () => new Date("2026-09-26T12:00:00.000Z");
const point = [-118.25513, 34.14252] as const;
const ring = [[-118.3, 34.1], [-118.2, 34.1], [-118.2, 34.2], [-118.3, 34.1]];
// Deliberately synthetic fixture; never use it as live data or in the UI.
function perimeter(overrides: Record<string, unknown> = {}, geometry: unknown = { type: "Polygon", coordinates: [ring] }) {
  return {
    type: "Feature", id: 1, geometry,
    properties: {
      OBJECTID: 1, poly_IncidentName: "SYNTHETIC TEST", poly_GISAcres: 100.4,
      poly_PolygonDateTime: 1790400000000, poly_DateCurrent: 1790410000000,
      attr_IncidentTypeCategory: "WF", attr_PercentContained: 10, ...overrides,
    },
  };
}
function reply(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe("searchEnvelope", () => {
  it("snaps the centre so the publisher never receives the exact point", () => {
    const box = searchEnvelope(point, 50);
    expect(box.ymin + (box.ymax - box.ymin) / 2).toBeCloseTo(34.1, 3);
    expect(box.xmin + (box.xmax - box.xmin) / 2).toBeCloseTo(-118.3, 3);
    expect(box.ymax - box.ymin).toBeGreaterThan(0.9);
  });
});

describe("fetchNifcPerimeters", () => {
  it("queries the layer with a coarse envelope and no exact coordinates", async () => {
    let requested = "";
    await fetchNifcPerimeters({ point, radiusKm: 50, now, fetcher: async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }));
    } });
    expect(requested.startsWith(`${NIFC_LAYER_URL}/query?`)).toBe(true);
    expect(requested).not.toContain("34.14252");
    expect(requested).not.toContain("118.25513");
    expect(new URL(requested).searchParams.get("f")).toBe("geojson");
  });

  it("maps categories and publisher clocks without inventing values", async () => {
    const result = await fetchNifcPerimeters({ point, radiusKm: 50, now, fetcher: reply({ type: "FeatureCollection", features: [
      perimeter(),
      perimeter({ OBJECTID: 2, attr_IncidentTypeCategory: "RX", poly_PolygonDateTime: null, poly_GISAcres: null }),
      perimeter({ OBJECTID: 3, attr_IncidentTypeCategory: "ZZ" }, { type: "MultiPolygon", coordinates: [[ring]] }),
    ] }) });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.perimeters.map((p) => p.incidentType)).toEqual(["wildfire", "prescribed", "unknown"]);
    expect(result.perimeters[0]?.polygonCapturedAt).toBe(new Date(1790400000000).toISOString());
    expect(result.perimeters[1]?.polygonCapturedAt).toBeNull();
    expect(result.perimeters[1]?.gisAcres).toBeNull();
  });

  it("treats truncated pages, ArcGIS error bodies and bad geometry as unavailable", async () => {
    expect(await fetchNifcPerimeters({ point, radiusKm: 50, now, fetcher: reply({
      type: "FeatureCollection", properties: { exceededTransferLimit: true }, features: [perimeter()],
    }) })).toMatchObject({ status: "unavailable", reason: "partial_response" });
    expect(await fetchNifcPerimeters({ point, radiusKm: 50, now, fetcher: reply({ error: { code: 400, message: "bad" } }) }))
      .toMatchObject({ status: "unavailable", reason: "invalid_response" });
    expect(await fetchNifcPerimeters({ point, radiusKm: 50, now, fetcher: reply({
      type: "FeatureCollection", features: [perimeter({}, { type: "Point", coordinates: [0, 0] })],
    }) })).toMatchObject({ status: "unavailable", reason: "invalid_response" });
    expect(await fetchNifcPerimeters({ point, radiusKm: 50, now, fetcher: reply({}, 503) }))
      .toMatchObject({ status: "unavailable", reason: "http_error", httpStatus: 503 });
  });
});
