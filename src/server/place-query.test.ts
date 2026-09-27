import { describe, expect, it } from "vitest";
import { readPlaceQuery } from "./place-query";

const endpoint = "http://localhost/api/v1/notices/query";
const validBody = JSON.stringify({ point: [-118.25, 34.15], userInitiated: true });

type StreamedRequest = {
  request: Request;
  pulled: () => number;
  cancelled: () => boolean;
};

function request(body: BodyInit | null, contentType = "application/json", headers: Record<string, string> = {}): Request {
  return new Request(endpoint, { method: "POST", headers: { "Content-Type": contentType, ...headers }, body });
}

function streamedRequest(chunks: Array<string | Uint8Array>, headers: Record<string, string> = {}): StreamedRequest {
  const pending = [...chunks];
  const encoder = new TextEncoder();
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      const next = pending.shift();
      if (next === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(typeof next === "string" ? encoder.encode(next) : next);
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: new Request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
    pulled: () => pulled,
    cancelled: () => cancelled,
  };
}

function splitUtf8Inside(text: string, needle: string): Uint8Array[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const needleBytes = encoder.encode(needle);
  const start = bytes.findIndex((_, index) => needleBytes.every((byte, offset) => bytes[index + offset] === byte));
  if (start < 0) throw new Error(`missing UTF-8 needle ${needle}`);
  return [bytes.slice(0, start + 1), bytes.slice(start + 1)];
}

function truncateInsideUtf8(text: string, needle: string): Uint8Array[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const needleBytes = encoder.encode(needle);
  const start = bytes.findIndex((_, index) => needleBytes.every((byte, offset) => bytes[index + offset] === byte));
  if (start < 0) throw new Error(`missing UTF-8 needle ${needle}`);
  return [bytes.slice(0, start + needleBytes.length - 1)];
}

async function responseStatus(result: Awaited<ReturnType<typeof readPlaceQuery>>): Promise<number> {
  return "error" in result ? result.error.status : 200;
}

describe("bounded Firepoint point query parsing", () => {
  it("accepts valid small JSON", async () => {
    const result = await readPlaceQuery(request(validBody));
    expect("query" in result).toBe(true);
    if ("query" in result) expect(result.query.point).toEqual([-118.25, 34.15]);
  });

  it("rejects a null body as invalid JSON", async () => {
    expect(await responseStatus(await readPlaceQuery(request(null)))).toBe(400);
  });

  it("accepts valid JSON when a multibyte UTF-8 character is split across chunks", async () => {
    const body = JSON.stringify({ point: [-118.25, 34.15], userInitiated: true, note: "🔥" });
    const streamed = streamedRequest(splitUtf8Inside(body, "🔥"));
    const result = await readPlaceQuery(streamed.request);
    expect(await responseStatus(result)).toBe(200);
    if ("query" in result) expect(result.query.point).toEqual([-118.25, 34.15]);
  });

  it("rejects malformed truncated UTF-8 as invalid JSON", async () => {
    const body = JSON.stringify({ point: [-118.25, 34.15], userInitiated: true, note: "🔥" });
    const streamed = streamedRequest(truncateInsideUtf8(body, "🔥"));
    expect(await responseStatus(await readPlaceQuery(streamed.request))).toBe(400);
  });

  it("keeps invalid JSON and media type failures as 400 and 415", async () => {
    expect(await responseStatus(await readPlaceQuery(request("not json")))).toBe(400);
    expect(await responseStatus(await readPlaceQuery(request(validBody, "text/plain")))).toBe(415);
  });

  it("rejects an absent Content-Length oversized stream without consuming all chunks", async () => {
    const chunks = Array.from({ length: 20 }, () => "x".repeat(128));
    const streamed = streamedRequest(chunks);
    const result = await readPlaceQuery(streamed.request);
    expect(await responseStatus(result)).toBe(413);
    expect(streamed.cancelled()).toBe(true);
    expect(streamed.pulled()).toBeLessThan(chunks.length);
  });

  it("rejects a lying Content-Length oversized stream without consuming all chunks", async () => {
    const chunks = Array.from({ length: 20 }, () => "x".repeat(128));
    const streamed = streamedRequest(chunks, { "Content-Length": "64" });
    const result = await readPlaceQuery(streamed.request);
    expect(await responseStatus(result)).toBe(413);
    expect(streamed.cancelled()).toBe(true);
    expect(streamed.pulled()).toBeLessThan(chunks.length);
  });
});
