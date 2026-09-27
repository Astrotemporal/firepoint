import { describe, expect, it } from "vitest";
import { createMapboxDirectionsProvider, parseMapboxDirections, RouteUnavailableError } from "./route-provider";

// Synthetic payload in the shape of a Mapbox Directions v5 response; test-only.
const step = (instruction: string, distance: number) => ({ distance, duration: distance / 10, maneuver: { instruction } });
const payload = {
  code: "Ok",
  routes: [
    {
      distance: 2338.1, duration: 529,
      geometry: { type: "LineString", coordinates: [[-118.2483, 34.1469], [-118.2488, 34.1469], [-118.2648, 34.1398]] },
      legs: [{ steps: [step("Turn left onto North Isabel Street.", 57), step("You have arrived at your destination.", 0)] }],
    },
    {
      distance: 2900, duration: 610,
      geometry: { type: "LineString", coordinates: [[-118.2483, 34.1469], [-118.2648, 34.1398]] },
      legs: [{ steps: [] }],
    },
  ],
};
const TOKEN = "pk.synthetic-test-token";

describe("Mapbox Directions provider", () => {
  it("converts [lng, lat] geometry and keeps Mapbox's instructions and alternatives", () => {
    const route = parseMapboxDirections(payload);
    expect(route.path[0]).toEqual({ lat: 34.1469, lng: -118.2483 });
    expect(route.durationSeconds).toBe(529);
    expect(route.steps.map((s) => s.instruction)).toEqual(["Turn left onto North Isabel Street.", "You have arrived at your destination."]);
    expect(route.alternatives).toHaveLength(1);
    expect(route.alternatives?.[0].durationSeconds).toBe(610);
    expect(route.steps.map((s) => s.turn)).toEqual([undefined, undefined]); // no maneuver type/modifier given
  });

  it("keeps each step's turn from Mapbox's maneuver type and modifier", () => {
    const turn = (type: string, modifier?: string) => ({ distance: 10, duration: 1, maneuver: { instruction: "x", type, modifier } });
    const route = parseMapboxDirections({ ...payload, routes: [{ ...payload.routes[0], legs: [{ steps: [
      turn("depart", "left"), turn("turn", "slight right"), turn("end of road", "uturn"), turn("new name", "straight"),
      turn("roundabout", "sideways"), turn("arrive", "right"),
    ] }] }] });
    expect(route.steps.map((s) => s.turn)).toEqual(["depart", "slight-right", "uturn", "straight", undefined, "arrive"]);
    expect(route.arrivesOnMotorway).toBeUndefined();
  });

  it("notes a route that ends on a freeway, from the road class of the step before arrival", () => {
    const onRoad = (classes?: string[]) => ({ ...step("x", 100), intersections: [{}, { classes }] });
    const ending = (classes?: string[]) => parseMapboxDirections({ ...payload, routes: [{ ...payload.routes[0], legs: [{ steps: [
      onRoad(), onRoad(classes), step("You have arrived at your destination.", 0),
    ] }] }] });
    expect(ending(["motorway"]).arrivesOnMotorway).toBe(true);
    expect(ending(["toll"]).arrivesOnMotorway).toBeUndefined();
    expect(ending(undefined).arrivesOnMotorway).toBeUndefined();
  });

  it("POSTs coordinates in the body, not the URL, with traffic-aware alternatives", async () => {
    let requested = "";
    let init: RequestInit | undefined;
    const getRoute = createMapboxDirectionsProvider({
      token: TOKEN,
      fetcher: async (input, options) => { requested = String(input); init = options; return Response.json(payload); },
    });
    await getRoute({ lat: 34.14662, lng: -118.24825 }, { lat: 34.13983, lng: -118.26478 });
    expect(requested).toBe(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic?access_token=${TOKEN}`);
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("coordinates")).toBe("-118.248250,34.146620;-118.264780,34.139830");
    expect(body.get("alternatives")).toBe("true");
    expect(body.get("geometries")).toBe("geojson");
  });

  it("treats a missing token, no route, HTTP errors and malformed bodies as unavailable", async () => {
    const unconfigured = createMapboxDirectionsProvider({ token: "", fetcher: async () => Response.json(payload) });
    await expect(unconfigured({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 })).rejects.toMatchObject({ reason: "not-configured" });
    expect(() => parseMapboxDirections({ code: "NoRoute", message: "No route found" })).toThrow(RouteUnavailableError);
    expect(() => parseMapboxDirections({ nonsense: true })).toThrow(RouteUnavailableError);
    const rateLimited = createMapboxDirectionsProvider({ token: TOKEN, fetcher: async () => new Response("slow down", { status: 429 }) });
    await expect(rateLimited({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 })).rejects.toThrow("Routing HTTP 429");
  });
});
