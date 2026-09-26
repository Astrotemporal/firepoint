import type { Hazard } from "./types";

/*
 * No incident hazard feed is connected. Return one stable EMPTY array for useSyncExternalStore;
 * absence is unknown, not an all-clear. Private drag marks are not feed hazards.
 * A future publisher adapter must preserve snapshot identity until a verified update,
 * notify subscribers, and carry its own source/freshness state. Do not add demo fires here.
 */
const EMPTY_HAZARDS: readonly Hazard[] = Object.freeze([]);

export function getActiveHazards(): readonly Hazard[] {
  return EMPTY_HAZARDS;
}

export function subscribeToHazards(_listener: () => void): () => void {
  // No feed exists to emit a change. The API shape is retained for a future sourced adapter.
  return () => {};
}
