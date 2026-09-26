import { z } from "zod";

/** This is a point-filtered NWS response, not a finding that a location is safe. */
const timestamp = z.iso.datetime({ offset: true });
const nwsAlertSchema = z.object({
  type: z.literal("Feature"),
  properties: z.object({
    id: z.string().min(1),
    "@id": z.url().refine(
      (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" && url.hostname === "api.weather.gov";
        } catch {
          return false;
        }
      },
      "Alert link must be an HTTPS api.weather.gov URL",
    ),
    sent: timestamp,
    updated: timestamp,
    effective: timestamp.nullable().optional(),
    expires: timestamp,
    status: z.string().optional(),
    event: z.string(),
    headline: z.string().nullable(),
    description: z.string(),
    instruction: z.string().nullable(),
    areaDesc: z.string(),
  }),
});
const nwsCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(nwsAlertSchema),
});

export type NwsAlert = {
  id: string;
  url: string;
  sent: string;
  updated: string;
  effective?: string | null;
  expires: string;
  status?: string;
  event: string;
  headline: string | null;
  description: string;
  instruction: string | null;
  areaDesc: string;
};

export type NwsActiveAlertsResult =
  | {
      status: "ok";
      sourceUrl: string;
      checkedAt: string;
      pointFiltered: true;
      alerts: NwsAlert[];
    }
  | {
      status: "unavailable";
      sourceUrl: string;
      attemptedAt: string;
      pointFiltered: true;
      reason: "http_error" | "timeout" | "network_error" | "invalid_response";
      httpStatus?: number;
    };

export type FetchNwsActiveAlertsOptions = {
  latitude: number;
  longitude: number;
  /** Server-side app identity with a reachable contact email or URL; never put secrets here. */
  userAgent: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
};

/**
 * Fetch NWS active alerts for one point. Even an empty successful result only
 * means NWS returned no alerts for that point at the time of this request.
 * Errors are explicit, and never converted to an empty alert list.
 */
export async function fetchNwsActiveAlerts({
  latitude,
  longitude,
  userAgent,
  fetcher = fetch,
  timeoutMs = 8_000,
  now = () => new Date(),
}: FetchNwsActiveAlertsOptions): Promise<NwsActiveAlertsResult> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError("NWS point requires valid latitude and longitude");
  }
  if (typeof userAgent !== "string" || /[\r\n]/.test(userAgent) ||
      !/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/\S+)/i.test(userAgent)) {
    throw new TypeError("NWS_USER_AGENT must identify the app with a contact email or URL");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("timeoutMs must be a positive integer");
  }

  const sourceUrl = new URL("https://api.weather.gov/alerts/active");
  sourceUrl.searchParams.set("point", `${latitude},${longitude}`);
  const url = sourceUrl.toString();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("NWS request timed out"));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetcher(url, {
        headers: { Accept: "application/geo+json", "User-Agent": userAgent },
        signal: controller.signal,
        cache: "no-store",
      }),
      timeout,
    ]);
    if (!response.ok) {
      return {
        status: "unavailable", sourceUrl: url, attemptedAt: now().toISOString(),
        pointFiltered: true, reason: "http_error", httpStatus: response.status,
      };
    }
    const raw: unknown = await Promise.race([response.json(), timeout]);
    const parsed = nwsCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: "unavailable", sourceUrl: url, attemptedAt: now().toISOString(),
        pointFiltered: true, reason: "invalid_response",
      };
    }
    return {
      status: "ok", sourceUrl: url, checkedAt: now().toISOString(),
      pointFiltered: true,
      alerts: parsed.data.features.map(({ properties: alert }) => ({
        id: alert.id,
        url: alert["@id"],
        sent: alert.sent,
        updated: alert.updated,
        ...(alert.effective !== undefined ? { effective: alert.effective } : {}),
        expires: alert.expires,
        ...(alert.status !== undefined ? { status: alert.status } : {}),
        event: alert.event,
        headline: alert.headline,
        description: alert.description,
        instruction: alert.instruction,
        areaDesc: alert.areaDesc,
      })),
    };
  } catch (error) {
    return {
      status: "unavailable", sourceUrl: url, attemptedAt: now().toISOString(),
      pointFiltered: true,
      reason: timedOut ? "timeout" : error instanceof SyntaxError ? "invalid_response" : "network_error",
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
