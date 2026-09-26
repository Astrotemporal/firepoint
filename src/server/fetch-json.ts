/** Why a source fetch produced no usable data. Never treated as an empty result. */
export type FetchFailure = "http_error" | "timeout" | "network_error" | "invalid_response";

export type FetchJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: FetchFailure; httpStatus?: number };

export type FetchJsonOptions = {
  headers?: Record<string, string>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

/** Bounded server-side GET that reports every failure explicitly. */
export async function fetchJson(
  url: string,
  { headers = {}, fetcher = fetch, timeoutMs = 8_000 }: FetchJsonOptions = {},
): Promise<FetchJsonResult> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("timeoutMs must be a positive integer");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("Request timed out"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetcher(url, { headers, signal: controller.signal, cache: "no-store" }),
      timeout,
    ]);
    if (!response.ok) return { ok: false, reason: "http_error", httpStatus: response.status };
    return { ok: true, data: await Promise.race([response.json(), timeout]) };
  } catch (error) {
    return {
      ok: false,
      reason: timedOut ? "timeout" : error instanceof SyntaxError ? "invalid_response" : "network_error",
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Great-circle distance in kilometres between two [longitude, latitude] points. */
export function distanceKm([lon1, lat1]: readonly [number, number], [lon2, lat2]: readonly [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
