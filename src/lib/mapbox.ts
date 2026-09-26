/**
 * Mapbox public token (pk.*) for the map, directions, and address search. It is visible to every
 * visitor by design; restrict it to the site's URLs in the Mapbox dashboard. Empty when unset.
 */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
/** Same basemaps as the homepage map, so both follow the site's light/dark theme. */
export const MAPBOX_STYLES = { light: "mapbox://styles/mapbox/streets-v12", dark: "mapbox://styles/mapbox/dark-v11" } as const;
