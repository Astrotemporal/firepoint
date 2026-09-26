import { z } from "zod";

/** Personal map marks. Private to one browser; never a report, notice, or shared claim. */
export const MARKS_KEY = "firepoint.marks.v1";
/** Three marks on the fire's edge triangulate its extent (see triangulation.ts); a fourth replaces the oldest. */
export const MAX_MARKS = 3;

const FireMarkSchema = z.object({
  id: z.string().min(1).max(64),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  placedAt: z.iso.datetime({ offset: true }),
});
export type FireMark = z.infer<typeof FireMarkSchema>;

/** Keeps the valid marks from stored JSON; anything unreadable is dropped, not repaired. */
export function parseMarks(raw: string | null): FireMark[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw ?? "[]"); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    const result = FireMarkSchema.safeParse(item);
    return result.success ? [result.data] : [];
  }).slice(-MAX_MARKS);
}

export function createMark(lat: number, lng: number, now = new Date()): FireMark {
  const id = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return FireMarkSchema.parse({ id, lat, lng: normalizeLng(lng), placedAt: now.toISOString() });
}

/** Adds a mark, dropping the oldest once the cap is reached. */
export function addMark(marks: FireMark[], mark: FireMark): FireMark[] {
  return [...marks, mark].slice(-MAX_MARKS);
}

export function moveMark(marks: FireMark[], id: string, lat: number, lng: number): FireMark[] {
  return marks.map((mark) => mark.id === id ? { ...mark, lat, lng: normalizeLng(lng) } : mark);
}

// Leaflet reports longitudes past ±180 when the world wraps; fold them back.
function normalizeLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}
