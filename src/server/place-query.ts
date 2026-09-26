import { PlaceQuerySchema, type PlaceQuery } from "@/domain/contracts";

export const PRIVATE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const MAX_BODY = 1024;

/** Parse a bounded JSON point query from a POST body, or return the error response to send. */
export async function readPlaceQuery(request: Request): Promise<{ query: PlaceQuery } | { error: Response }> {
  const fail = (message: string, status: number) => ({ error: Response.json({ error: message }, { status, headers: PRIVATE_HEADERS }) });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("JSON body required", 415);
  if (Number(request.headers.get("content-length")) > MAX_BODY) return fail("Body too large", 413);
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return fail("Body too large", 413);
    payload = JSON.parse(text);
  } catch {
    return fail("Invalid JSON", 400);
  }
  const parsed = PlaceQuerySchema.safeParse(payload);
  if (!parsed.success) return fail("Invalid point or missing user action", 400);
  return { query: parsed.data };
}
