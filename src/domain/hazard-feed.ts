import { StandingHazardFeedSchema, type SourceCheck, type StandingHazardFeed } from "./contracts";
import { GLENDALE_GIS_PROJECT_URL, type GisHazardsResult } from "@/server/glendale-gis";

/** A reference snapshot; Firepoint treats it as stale after a week without a rebuild. */
const SNAPSHOT_STALE_SECONDS = 7 * 24 * 3600;
const BASE = {
  sourceKey: "glendale-gis-hazards", operator: "Glendale GIS MCP (Hacker Fund)",
  endpoint: GLENDALE_GIS_PROJECT_URL, applicable: true, staleAfterSeconds: SNAPSHOT_STALE_SECONDS,
} as const;

const DETAIL: Record<string, string> = {
  unauthorized: "The Glendale GIS server rejected Firepoint's key.",
  rate_limited: "The Glendale GIS server is rate-limiting requests; try again shortly.",
  tool_error: "The Glendale GIS server could not answer for this place.",
};

/** Build the standing-hazard feed. Outside coverage and outages stay distinct from "not in a zone". */
export function buildHazardFeed(result: GisHazardsResult | "not-configured", generatedAt: string): StandingHazardFeed {
  let check: SourceCheck;
  if (result === "not-configured") {
    check = { ...BASE, status: "not-configured", lastAttemptAt: null, lastSuccessAt: null, sourceAsOf: null,
      detail: "Server has no GLENDALE_GIS_MCP_KEY; mapped hazard zones were not looked up." };
  } else if (result.status !== "ok") {
    check = { ...BASE, status: "down", lastAttemptAt: result.attemptedAt, lastSuccessAt: null, sourceAsOf: null,
      detail: DETAIL[result.reason] ?? `Glendale GIS request unavailable (${result.reason}${result.httpStatus ? ` ${result.httpStatus}` : ""})` };
  } else {
    const outside = result.hazards.every((hazard) => hazard.lookup === "unavailable");
    check = {
      ...BASE,
      status: outside ? "outside-coverage" : result.anyStale ? "stale" : "ok",
      lastAttemptAt: result.checkedAt, lastSuccessAt: result.checkedAt, sourceAsOf: result.snapshotAsOf,
      detail: outside ? "This place is outside the Glendale hazard maps' coverage (Glendale plus about 2 km)."
        : result.anyStale ? "The GIS server reports that some hazard layers are stale." : null,
    };
  }
  const hazards = result !== "not-configured" && result.status === "ok" ? result.hazards : [];
  return StandingHazardFeedSchema.parse({ version: 1, generatedAt, sourceChecks: [check], hazards, allClear: false });
}
