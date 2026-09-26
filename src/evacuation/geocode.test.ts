import { describe, expect, it } from "vitest";
import { geocode } from "./geocode";

// Synthetic responses in the shape of Mapbox Geocoding v6; test-only.
const feature = (name: string, place: string, [lng, lat]: [number, number]) =>
  ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { name, place_formatted: place } });
const TOKEN = "pk.synthetic-test-token";

describe("geocode", () => {
  it("searches Mapbox within a box around Glendale and returns a short label", async () => {
    let requested = "";
    const place = await geocode(" 1613 Glencoe Way ", {
      token: TOKEN,
      fetcher: async (input) => {
        requested = String(input);
        return Response.json({ features: [feature("1613 Glencoe Way", "Glendale, California 91208, United States", [-118.230596, 34.199056])] });
      },
    });
    const url = new URL(requested);
    expect(url.origin + url.pathname).toBe("https://api.mapbox.com/search/geocode/v6/forward");
    expect(url.searchParams.get("q")).toBe("1613 Glencoe Way");
    expect(url.searchParams.get("bbox")).toBe("-118.40,34.08,-118.13,34.28");
    expect(place).toEqual({ lat: 34.199056, lng: -118.230596, label: "1613 Glencoe Way, Glendale" });
  });

  it("returns null for no match and throws on a broken or unconfigured lookup instead of guessing", async () => {
    expect(await geocode("nowhere", { token: TOKEN, fetcher: async () => Response.json({ features: [] }) })).toBeNull();
    await expect(geocode("x", { token: TOKEN, fetcher: async () => new Response("", { status: 401 }) })).rejects.toThrow("HTTP 401");
    await expect(geocode("x", { token: TOKEN, fetcher: async () => Response.json({ error: "?" }) })).rejects.toThrow("Unexpected");
    await expect(geocode("x", { token: "" })).rejects.toThrow("not configured");
  });
});
