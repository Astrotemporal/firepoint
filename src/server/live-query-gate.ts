/** A local developer demonstration is not a public emergency-information service. */
export function demoLiveSourcesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.FIREPOINT_DEMO_LIVE_SOURCES === "enabled";
}

/** No upstream contact or point echo when public source-query routes are paused. */
export function pausedSourceResponse(headers: HeadersInit): Response {
  return Response.json({ error: "Live source checks are paused. Use the official agency links instead." },
    { status: 503, headers });
}
