import { describe, expect, it } from "vitest";
import { fetchGlendaleHazards, parseRpcBody } from "./glendale-gis";

const now = () => new Date("2026-09-26T12:00:00.000Z");
const point = [-118.25, 34.15] as const;
const apiKey = "SYNTHETIC-TEST-KEY";

// Deliberately synthetic fixture shaped like hazards_at_location; never used as live data.
function layer(dataset: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    dataset, title: `SYNTHETIC ${dataset}`, status, notes: ["Synthetic note."], disclaimer: "Synthetic disclaimer.",
    _meta: { source: "Synthetic Agency", url: "https://example.org/layer", as_of: "2026-09-26T02:00:00+00:00", stale: false,
      source_last_edit: "2026-02-02T17:34:07+00:00" },
    ...extra,
  };
}
function payload(status = "not_in_zone", reason?: string) {
  const base = (id: string) => layer(id, status, reason ? { reason } : {});
  return {
    location: { lat: 34.15, lon: -118.25, in_city: status !== "unavailable" },
    wildfire: layer("calfire_fhsz_lra", status === "unavailable" ? status : "in_zone", {
      class_field: "FHSZ_Description", ...(reason ? { reason } : {}),
      matches: status === "unavailable" ? [] : [{ attributes: { FHSZ_Description: "Very High" }, ref: { object_id: 9, layer_url: "https://example.org/fhsz" } }],
    }),
    flood: layer("fema_flood_zones", status === "unavailable" ? status : "in_zone", {
      class_field: "FLD_ZONE", ...(reason ? { reason } : {}),
      matches: status === "unavailable" ? [] : [{ attributes: { FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD" }, ref: { object_id: 3 } }],
    }),
    fault: base("cgs_fault_zones"), liquefaction: base("cgs_liquefaction_zones"), landslide: base("cgs_landslide_zones"),
    dam_inundation: base("dwr_dam_inundation"), debris_flow: base("usgs_debris_flow"),
  };
}
function sse(body: unknown, id = 1) {
  return `event: message\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(body) }], isError: false } })}\r\n\r\n`;
}
function reply(text: string, status = 200, type = "text/event-stream"): typeof fetch {
  return async () => new Response(text, { status, headers: { "content-type": type } });
}

describe("parseRpcBody", () => {
  it("finds the matching reply in an event stream or plain JSON", () => {
    expect(parseRpcBody(sse({ ok: 1 }), "text/event-stream", 1)).toMatchObject({ id: 1 });
    expect(parseRpcBody('{"jsonrpc":"2.0","id":1,"result":{}}', "application/json", 1)).toMatchObject({ id: 1 });
    expect(() => parseRpcBody(sse({ ok: 1 }, 7), "text/event-stream", 1)).toThrow(SyntaxError);
  });
});

describe("fetchGlendaleHazards", () => {
  it("sends one stateless tools/call with the key in a header, never the URL", async () => {
    let requested = "";
    let init: RequestInit | undefined;
    await fetchGlendaleHazards({ point, apiKey, now, fetcher: async (input, options) => {
      requested = String(input); init = options;
      return new Response(sse(payload()), { headers: { "content-type": "text/event-stream" } });
    } });
    expect(requested).not.toContain(apiKey);
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${apiKey}`);
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ method: "tools/call", params: { name: "hazards_at_location", arguments: { location: { lat: 34.15, lon: -118.25 } } } });
  });

  it("maps each layer to a standing hazard with the publisher's class, clocks and caveats", async () => {
    const result = await fetchGlendaleHazards({ point, apiKey, now, fetcher: reply(sse(payload())) });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.hazards.map((h) => h.hazard)).toEqual(["wildfire", "flood", "fault-rupture", "liquefaction", "landslide", "dam-inundation", "debris-flow"]);
    expect(result.hazards[0]).toMatchObject({ classification: "Very High", lookup: "inside", coverage: "verified" });
    expect(result.hazards[0]?.origin).toMatchObject({ issuer: "Synthetic Agency", recordUrl: "https://example.org/fhsz", updatedAt: "2026-02-02T17:34:07.000Z" });
    expect(result.hazards[1]?.classification).toBe("Zone X (area of minimal flood hazard)");
    expect(result.hazards[2]).toMatchObject({ lookup: "outside", classification: null });
    expect(result.hazards[2]?.caveat).toBe("Synthetic note. Synthetic disclaimer.");
    expect(result.snapshotAsOf).toBe("2026-09-26T02:00:00.000Z");
  });

  it("keeps out-of-coverage answers unavailable, never 'not in a zone'", async () => {
    const result = await fetchGlendaleHazards({ point, apiKey, now, fetcher: reply(sse(payload("unavailable", "Point is outside the covered area"))) });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.hazards.every((h) => h.lookup === "unavailable" && h.coverage === "out-of-bounds")).toBe(true);
  });

  it("names a rejected key, rate limiting, tool errors and schema drift", async () => {
    expect(await fetchGlendaleHazards({ point, apiKey, now, fetcher: reply("", 401) })).toMatchObject({ status: "unavailable", reason: "unauthorized" });
    expect(await fetchGlendaleHazards({ point, apiKey, now, fetcher: reply("", 429) })).toMatchObject({ status: "unavailable", reason: "rate_limited" });
    const toolError = `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "boom" }], isError: true } })}\n\n`;
    expect(await fetchGlendaleHazards({ point, apiKey, now, fetcher: reply(toolError) })).toMatchObject({ reason: "tool_error" });
    expect(await fetchGlendaleHazards({ point, apiKey, now, fetcher: reply(sse({ location: {} })) })).toMatchObject({ reason: "invalid_response" });
    expect(await fetchGlendaleHazards({ point, apiKey, now, fetcher: async () => { throw new TypeError("offline"); } })).toMatchObject({ reason: "network_error" });
  });

  it("refuses unusable keys and non-HTTPS remote URLs before sending anything", async () => {
    await expect(fetchGlendaleHazards({ point, apiKey: " ", now, fetcher: reply("") })).rejects.toThrow(TypeError);
    await expect(fetchGlendaleHazards({ point, apiKey, url: "http://example.org/mcp", now, fetcher: reply("") })).rejects.toThrow(TypeError);
  });
});
