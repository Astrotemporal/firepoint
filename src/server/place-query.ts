import { PlaceQuerySchema, type PlaceQuery } from "@/domain/contracts";

export const PRIVATE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const MAX_BODY_BYTES = 1024;

type BoundedBody = { text: string } | { tooLarge: true } | { invalid: true };

async function readBoundedText(request: Request): Promise<BoundedBody> {
  if (!request.body) return { text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_BODY_BYTES) {
        await reader.cancel("Body too large").catch(() => undefined);
        return { tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text };
  } catch {
    await reader.cancel("Invalid request body").catch(() => undefined);
    return { invalid: true };
  } finally {
    reader.releaseLock();
  }
}

/** Parse a bounded JSON point query from a POST body, or return the error response to send. */
export async function readPlaceQuery(request: Request): Promise<{ query: PlaceQuery } | { error: Response }> {
  const fail = (message: string, status: number) => ({ error: Response.json({ error: message }, { status, headers: PRIVATE_HEADERS }) });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("JSON body required", 415);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return fail("Body too large", 413);

  const body = await readBoundedText(request);
  if ("tooLarge" in body) return fail("Body too large", 413);
  if ("invalid" in body) return fail("Invalid JSON", 400);

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return fail("Invalid JSON", 400);
  }
  const parsed = PlaceQuerySchema.safeParse(payload);
  if (!parsed.success) return fail("Invalid point or missing user action", 400);
  return { query: parsed.data };
}
