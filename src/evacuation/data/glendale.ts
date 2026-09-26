import type { LatLng, SafeZone, Shelter } from "../types";

/*
 * Hardcoded Glendale data for the routing module. NOTHING here is confirmed operational.
 * Shelter coordinates are the City of Glendale address geocoder's point for each street address
 * (checked 2026-09-26); the brief's approximate coordinates were 150 m–1.1 km off. Capacity,
 * occupancy, pets and ADA are unknown (null) until confirmed with the City of Glendale / Red Cross.
 * `status: "open"` is a stub value so routing can be exercised.
 */

/** Glendale City Hall, 613 E Broadway. Default start point when device location is unavailable. */
export const GLENDALE_CITY_HALL: LatLng & { label: string } = {
  lat: 34.14662,
  lng: -118.24825,
  label: "Glendale City Hall",
};

/** Beyond this distance a device location cannot use Glendale shelters meaningfully. */
export const SERVICE_RADIUS_METERS = 50_000;

export const SHELTERS: readonly Shelter[] = [
  {
    id: "glendale-civic-auditorium",
    name: "Glendale Civic Auditorium",
    address: "1401 N Verdugo Rd, Glendale, CA 91208",
    lat: 34.16649,
    lng: -118.2316,
    capacity: null,
    currentOccupancy: null,
    petsAllowed: null,
    adaCompliant: null,
    status: "open",
    verified: false,
  },
  {
    id: "pacific-community-center",
    name: "Pacific Community Center",
    address: "501 S Pacific Ave, Glendale, CA 91204",
    lat: 34.13983,
    lng: -118.26478,
    capacity: null,
    currentOccupancy: null,
    petsAllowed: null,
    adaCompliant: null,
    status: "open",
    verified: false,
  },
  {
    id: "sparr-heights-community-center",
    name: "Sparr Heights Community Center",
    address: "1613 Glencoe Way, Glendale, CA 91208",
    lat: 34.19906,
    lng: -118.23061,
    capacity: null,
    currentOccupancy: null,
    petsAllowed: null,
    adaCompliant: null,
    status: "open",
    verified: false,
  },
];

/** Area points, not addresses. Descriptions avoid compass words: the UI computes direction live. */
export const SAFE_ZONES: readonly SafeZone[] = [
  {
    id: "galleria-i5",
    name: "Glendale Galleria / I-5 corridor",
    description: "Glendale Galleria and I-5 corridor, below the foothills",
    lat: 34.1459,
    lng: -118.2556,
    priority: "primary",
  },
  {
    id: "burbank-sr134",
    name: "Burbank via SR-134",
    description: "Burbank, reached via SR-134",
    lat: 34.1808,
    lng: -118.309,
    priority: "secondary",
  },
];
