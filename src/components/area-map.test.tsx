import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AreaMap } from "./area-map";
import { GLENDALE_VIEW, OPENFREEMAP_STYLE_URL } from "../lib/map-style";

describe("display-only map", () => {
  it("starts with an explicit network opt-in and no emergency claims", () => {
    const html = renderToStaticMarkup(<AreaMap />);
    expect(html).toContain("Load street map (uses internet)");
    expect(html).toContain("For orientation only");
    expect(html).toContain("does not show current incidents, hazards, evacuation orders, or official zones");
    expect(html).toContain("not saved for offline use");
    expect(html).toContain("openstreetmap.org/copyright");
    expect(html).not.toContain("maplibregl-canvas");
  });

  it("uses keyless OpenFreeMap style and a general Glendale camera", () => {
    expect(OPENFREEMAP_STYLE_URL).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(GLENDALE_VIEW).toEqual({ longitude: -118.2551, latitude: 34.1425, zoom: 11 });
  });
});
