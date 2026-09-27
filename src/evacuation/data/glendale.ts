import type { LatLng, Shelter } from "../types";
import stationData from "./emergency-stations.json";

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

/** Community centers used or set up as shelters. */
export const COMMUNITY_SHELTERS: readonly Shelter[] = [
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
    // Opened as an evacuation center for the May 2013 Chevy Chase / Glenoaks canyon brush fire (Glendale PD
    // Bulletin 13-37, 2013-05-03; see recent-shelters.json). Coordinates: City of Glendale geocoder, 2026-09-26.
    id: "glendale-adult-recreation-center",
    name: "Adult Recreation Center",
    address: "201 E Colorado St, Glendale, CA 91205",
    lat: 34.143507,
    lng: -118.253529,
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

/**
 * Police and fire stations in and around Glendale, routed and pinned like the shelters above. From
 * emergency-stations.json (31 stations, each with its agency source; Glendale's from the City GIS layers, the rest
 * geocoded by the U.S. Census Bureau; checked 2026-09-26). None is a designated shelter, and fire stations are often
 * unstaffed while crews are out on a fire, so they carry the same unverified, unknown-capacity status.
 */
export const STATION_SHELTERS: readonly Shelter[] = stationData.stations.map((station) => ({
  id: station.id,
  name: station.name,
  address: station.address,
  lat: station.lat,
  lng: station.lng,
  capacity: null,
  currentOccupancy: null,
  petsAllowed: null,
  adaCompliant: null,
  status: "open",
  verified: false,
}));

/** Everything the shelter route can lead to. */
export const SHELTERS: readonly Shelter[] = [...COMMUNITY_SHELTERS, ...STATION_SHELTERS];
