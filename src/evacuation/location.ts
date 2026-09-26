import { GLENDALE_CITY_HALL } from "./data/glendale";
import type { LatLng } from "./types";

export const GEOLOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 };
/** Above this reported accuracy the UI shows a "location approximate" badge. */
export const APPROXIMATE_ACCURACY_METERS = 100;

export type LocationFix = LatLng & {
  /** Reported 95% radius in meters; null when the point did not come from the device. */
  accuracyMeters: number | null;
  source: "gps" | "manual" | "default";
  label: string | null;
};

/** `dismissed`: the prompt was closed and can be shown again. `denied`: blocked for this site (or unknown). */
export type FallbackReason = "denied" | "dismissed" | "unavailable" | "unsupported" | "insecure";

export type LocationState =
  | { status: "idle"; fix: null }
  /** `granted`: the site already has permission, so there is nothing to ask. */
  | { status: "locating"; fix: null; attempt: 1 | 2; granted?: boolean }
  | { status: "tracking"; fix: LocationFix }
  /** Routing uses Glendale City Hall until a real or manual location is available. */
  | { status: "fallback"; fix: LocationFix; reason: FallbackReason }
  | { status: "manual"; fix: LocationFix };

export const DEFAULT_FIX: LocationFix = {
  lat: GLENDALE_CITY_HALL.lat,
  lng: GLENDALE_CITY_HALL.lng,
  accuracyMeters: null,
  source: "default",
  label: GLENDALE_CITY_HALL.label,
};

export function isApproximate(fix: LocationFix | null): boolean {
  return fix?.accuracyMeters != null && fix.accuracyMeters > APPROXIMATE_ACCURACY_METERS;
}

type GeolocationLike = Pick<Geolocation, "watchPosition" | "clearWatch">;
type PositionLike = { coords: { latitude: number; longitude: number; accuracy: number } };
type PositionErrorLike = { code: number };
type PermissionStatusLike = Pick<PermissionStatus, "state" | "addEventListener" | "removeEventListener">;
export type LocationEnvironment = {
  geolocation?: GeolocationLike;
  secureContext: boolean;
  queryPermission?: () => Promise<PermissionStatusLike>;
};

const PERMISSION_DENIED = 1;
const IDLE: LocationState = { status: "idle", fix: null };

function browserEnvironment(): LocationEnvironment {
  if (typeof window === "undefined") return { secureContext: false };
  return {
    geolocation: "geolocation" in navigator ? navigator.geolocation : undefined,
    secureContext: window.isSecureContext,
    queryPermission: navigator.permissions?.query ? () => navigator.permissions.query({ name: "geolocation" }) : undefined,
  };
}

/**
 * Live location as an external store (for useSyncExternalStore). The page calls `activate()` on
 * load, which shows the browser's own permission prompt, like a maps app, and follows the site's
 * permission afterwards. Positions stay in memory; nothing here persists them.
 */
export class LocationTracker {
  private state: LocationState = IDLE;
  private readonly listeners = new Set<() => void>();
  private watchId: number | null = null;
  private geolocation: GeolocationLike | null = null;
  private resumeWatch = false;
  private permission: PermissionStatusLike | null = null;
  private unlistenPermission: (() => void) | null = null;

  constructor(private readonly environment: () => LocationEnvironment = browserEnvironment) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.state;

  /** On page load: start watching (prompting if needed), or restart a watch paused by `stop()`. */
  activate(): void {
    this.listenToPermission();
    if (this.resumeWatch && this.geolocation) {
      this.resumeWatch = false;
      this.watch(this.geolocation);
    } else if (this.state.status === "idle") {
      this.start();
    }
  }

  /** Begin watching; also the "Use my location" / "Try again" action. */
  start(): void {
    const environment = this.environment();
    if (!environment.secureContext) return this.fallback("insecure");
    if (!environment.geolocation) return this.fallback("unsupported");
    this.geolocation = environment.geolocation;
    this.set({ status: "locating", fix: null, attempt: 1, granted: this.permission?.state === "granted" });
    this.watch(environment.geolocation);
  }

  /** Use a typed address or ZIP instead of the device location. */
  setManual(point: LatLng, label: string): void {
    this.clearWatch();
    this.resumeWatch = false;
    this.set({ status: "manual", fix: { lat: point.lat, lng: point.lng, accuracyMeters: null, source: "manual", label } });
  }

  /** Stop the device watch (e.g. on unmount). `activate()` restarts it. */
  stop(): void {
    this.resumeWatch = this.watchId !== null;
    this.clearWatch();
    this.unlistenPermission?.();
    this.unlistenPermission = null;
  }

  private listenToPermission(): void {
    const query = this.environment().queryPermission;
    if (!query || this.unlistenPermission) return;
    let active = true;
    this.unlistenPermission = () => {
      active = false;
      this.permission?.removeEventListener("change", this.onPermissionChange);
      this.permission = null;
    };
    query().then((status) => {
      if (!active) return;
      this.permission = status;
      status.addEventListener("change", this.onPermissionChange);
      this.onPermissionChange();
    }).catch(() => { /* Optional: the prompt works without it. */ });
  }

  private onPermissionChange = () => {
    const permission = this.permission?.state;
    const current = this.state;
    if (current.status === "locating") {
      const granted = permission === "granted";
      if (Boolean(current.granted) !== granted) this.set({ ...current, granted });
    } else if (current.status === "fallback") {
      // Allowed in settings: start now, no reload needed.
      if (permission === "granted" && (current.reason === "denied" || current.reason === "dismissed")) this.start();
      else if (permission === "prompt" && current.reason === "denied") this.fallback("dismissed");
      else if (permission === "denied" && current.reason === "dismissed") this.fallback("denied");
    }
  };

  private watch(geolocation: GeolocationLike): void {
    this.clearWatch();
    this.watchId = geolocation.watchPosition(this.onPosition, this.onError, GEOLOCATION_OPTIONS);
  }

  private clearWatch(): void {
    if (this.watchId !== null) this.geolocation?.clearWatch(this.watchId);
    this.watchId = null;
  }

  private onPosition = (position: PositionLike) => {
    if (this.state.status === "manual") return;
    const { latitude, longitude, accuracy } = position.coords;
    this.set({
      status: "tracking",
      fix: { lat: latitude, lng: longitude, accuracyMeters: accuracy, source: "gps", label: null },
    });
  };

  private onError = (error: PositionErrorLike) => {
    if (error.code === PERMISSION_DENIED) {
      this.clearWatch();
      // Closing the prompt also reports "denied", but then the permission is still "prompt".
      return this.fallback(this.permission?.state === "prompt" ? "dismissed" : "denied");
    }
    // Timeout or position unavailable. A watch keeps running after these errors, so an existing
    // fix is kept, and a fallback upgrades itself when a fix eventually arrives.
    if (this.state.status !== "locating") return;
    if (this.state.attempt === 1 && this.geolocation) {
      this.set({ status: "locating", fix: null, attempt: 2 });
      this.watch(this.geolocation);
      return;
    }
    this.fallback("unavailable");
  };

  private fallback(reason: FallbackReason): void {
    this.set({ status: "fallback", fix: DEFAULT_FIX, reason });
  }

  private set(next: LocationState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
