import type { Hazard } from "./types";

/*
 * STUB hazard source: empty until a vetted feed is connected. Disaster detection lives elsewhere; see README
 * "Replacing the hazard stub". Contract for a real feed: getActiveHazards() returns the SAME array instance until
 * the list changes (it backs React's useSyncExternalStore), and subscribers are called after each change.
 * An empty list is not an all-clear; the directions bar says so.
 */

const NONE: readonly Hazard[] = [];

export function getActiveHazards(): readonly Hazard[] {
  return NONE;
}

export function subscribeToHazards(listener: () => void): () => void {
  void listener;
  return () => {};
}
