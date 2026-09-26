/*
 * Public release gate for the unverified homepage prototype.
 *
 * The routing prototype (hardcoded `open` shelters, invented escape targets, Mapbox Directions,
 * "Go" links and the automatic geolocation prompt) is developer-only. Nothing in it is verified
 * emergency guidance, so no production build may render it: Vercel Production and Vercel Preview
 * both build with NODE_ENV=production and always get the public screen.
 *
 * The switch is a server-only variable (not NEXT_PUBLIC_*), read at request time on the server.
 * It is ignored whenever NODE_ENV is "production", so no Vercel setting can turn it on by accident.
 */
const PROTOTYPE_FLAG = "FIREPOINT_PROTOTYPE_ROUTING";

/** True only for a deliberate local `next dev` / test run with `FIREPOINT_PROTOTYPE_ROUTING=enabled`. */
export function unverifiedRoutingPrototypeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env[PROTOTYPE_FLAG] === "enabled";
}
