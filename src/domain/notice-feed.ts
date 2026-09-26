import { NoticeFeedSchema, type NoticeFeed, type OfficialNotice, type SourceCheck } from "./contracts";
import type { NwsActiveAlertsResult } from "@/server/nws";

const NWS_ENDPOINT = "https://api.weather.gov/alerts/active";
/** Firepoint freshness policy, not a statement about NWS publication frequency. */
const NWS_FRESHNESS_SECONDS = 120;

/** Normalize one NWS point response without upgrading it to evacuation authority. */
export function asNwsNoticeFeed(result: NwsActiveAlertsResult, generatedAt: string): NoticeFeed {
  const success = result.status === "ok";
  const check: SourceCheck = {
    sourceKey: "nws-active-alerts",
    operator: "National Weather Service",
    endpoint: NWS_ENDPOINT, // omit point query from browser-visible traces
    applicable: true,
    status: success ? "ok" : "down",
    lastAttemptAt: success ? result.checkedAt : result.attemptedAt,
    lastSuccessAt: success ? result.checkedAt : null,
    sourceAsOf: null,
    staleAfterSeconds: NWS_FRESHNESS_SECONDS,
    detail: success ? null : `NWS request unavailable (${result.reason})`,
  };
  // Query-side filtering is not enough: never promote a test/exercise message to a live notice.
  const notices: OfficialNotice[] = success ? result.alerts.filter((alert) => alert.status === "Actual").map((alert) => ({
    kind: "official-notice",
    category: "weather",
    headline: alert.headline || alert.event,
    description: alert.description || null,
    instructions: alert.instruction,
    startsAt: alert.effective ?? null,
    // CAP `expires` ends this MESSAGE; only `ends` describes the event end, if provided.
    endsAt: alert.ends ?? null,
    // CAP "Actual" is message type/status, NOT an evacuation order or all-clear.
    issuerStatus: "unknown",
    match: "publisher-point-filter",
    areaDescription: alert.areaDesc || null,
    origin: {
      operator: "National Weather Service",
      issuer: null, // the original alert does not identify a separately verified local issuer here
      recordId: alert.id,
      recordUrl: alert.url,
      retrievedAt: result.checkedAt,
      issuedAt: alert.sent,
      updatedAt: alert.updated,
    },
  })) : [];
  return NoticeFeedSchema.parse({ version: 1, generatedAt, sourceChecks: [check], notices, allClear: false });
}

/** Honest response when no identifying NWS User-Agent has been configured. */
export function unconfiguredNwsFeed(generatedAt: string): NoticeFeed {
  return NoticeFeedSchema.parse({
    version: 1, generatedAt, allClear: false, notices: [],
    sourceChecks: [{
      sourceKey: "nws-active-alerts", operator: "National Weather Service",
      endpoint: NWS_ENDPOINT, applicable: true, status: "not-configured",
      lastAttemptAt: null, lastSuccessAt: null, sourceAsOf: null,
      staleAfterSeconds: NWS_FRESHNESS_SECONDS,
      detail: "Server has no valid identifying NWS_USER_AGENT; live notices were not checked.",
    }],
  });
}
