// Synthetic Glendale GIS MCP stand-in for adapter tests and local wiring checks.
//
// It answers the one JSON-RPC call Firepoint makes (`tools/call` -> `hazards_at_location`)
// with data that is marked SYNTHETIC in every title, source and caveat. It is NOT the
// Glendale GIS MCP, holds no snapshot, and must never be used for demos, screenshots, or
// resident-facing content. It only binds loopback addresses.
//
// Paths select an upstream misbehaviour so the adapter's bounds can be exercised end to end
// over a real socket (see src/server/glendale-gis.stub.test.ts):
//   /mcp                  ok, text/event-stream (add ?format=json for application/json)
//   /mcp/redirect         302 to /mcp (the adapter must not follow; the key stays put)
//   /mcp/html             200 text/html
//   /mcp/oversize         200 with a chunked body larger than GIS_MAX_RESPONSE_BYTES
//   /mcp/oversize-declared 200 with Content-Length above the bound and a tiny body
//   /mcp/hang             never sends headers
//   /mcp/slow-body        sends headers, then stalls without finishing the body
//   /mcp/rate-limited     429 with Retry-After: 30
//   /mcp/tool-error       isError: true
//   /mcp/wrong-id         a reply for a different JSON-RPC id
// Any request without `Authorization: Bearer <key>` gets 401, like the hosted server.
//
// CLI: node scripts/gis-mcp-stub.mjs [port] (default 8765; key from GIS_STUB_KEY or
// "synthetic-local-key"). Then, for `next dev` only:
//   GLENDALE_GIS_MCP_URL=http://127.0.0.1:8765/mcp GLENDALE_GIS_MCP_KEY=synthetic-local-key
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

export const STUB_DEFAULT_KEY = "synthetic-local-key";
export const STUB_OVERSIZE_BYTES = 1024 * 1024 + 64 * 1024; // above GIS_MAX_RESPONSE_BYTES

const META = {
  source: "SYNTHETIC Firepoint stub (not an agency)",
  url: "https://example.invalid/synthetic-stub",
  cached: true,
  as_of: "2026-01-01T00:00:00+00:00",
  stale: false,
  source_last_edit: null,
};

function layer(dataset, status, extra = {}) {
  return {
    dataset,
    title: `SYNTHETIC STUB ${dataset}`,
    status,
    matches: [],
    notes: ["SYNTHETIC stub data for adapter tests; not a hazard map."],
    disclaimer: "SYNTHETIC: produced by scripts/gis-mcp-stub.mjs, never by an agency.",
    _meta: META,
    ...extra,
  };
}

/** Shaped like the pinned upstream's HazardsAtLocation; every value is synthetic. */
export function syntheticHazards(lat, lon) {
  return {
    location: { lat, lon, in_city: true, source: "coordinates" },
    wildfire: layer("calfire_fhsz_lra", "in_zone", {
      class_field: "FHSZ_Description",
      matches: [{ attributes: { FHSZ_Description: "SYNTHETIC CLASS" },
        ref: { dataset: "calfire_fhsz_lra", object_id: 1, global_id: null, layer_url: "https://example.invalid/synthetic-layer" } }],
    }),
    flood: layer("fema_flood_zones", "not_in_zone", { class_field: "FLD_ZONE" }),
    fault: layer("cgs_fault_zones", "not_in_zone"),
    liquefaction: layer("cgs_liquefaction_zones", "not_in_zone"),
    landslide: layer("cgs_landslide_zones", "not_in_zone"),
    dam_inundation: layer("dwr_dam_inundation", "not_in_zone"),
    debris_flow: layer("usgs_debris_flow", "unavailable", { reason: "SYNTHETIC: layer missing from stub" }),
  };
}

function rpcResult(id, payload, isError = false) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError } };
}

function readBody(request, limit = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error("request too large")); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, status, body, headers = {}) {
  const text = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text), ...headers });
  response.end(text);
}

/**
 * Start the stub on a loopback address. `port: 0` picks a free port. Resolves with the
 * base URL, a request log (method, path, authorized, bodyBytes; never the key or body) and
 * a close() function.
 */
export function startGisStub({ port = 0, host = "127.0.0.1", key = STUB_DEFAULT_KEY } = {}) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("The synthetic stub only listens on loopback");
  const requests = [];
  const open = new Set();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}`);
    const header = request.headers.authorization ?? "";
    const authorized = header === `Bearer ${key}`;
    let body = "";
    try { body = await readBody(request); } catch { sendJson(response, 413, { error: "SYNTHETIC: request too large" }); return; }
    requests.push({ method: request.method, path: url.pathname, authorized, bodyBytes: Buffer.byteLength(body) });

    if (url.pathname === "/health") { sendJson(response, 200, { status: "ok", synthetic: true }); return; }
    if (request.method !== "POST") { sendJson(response, 405, { error: "SYNTHETIC: POST only" }); return; }
    if (!authorized) { sendJson(response, 401, { error: "SYNTHETIC: send Authorization: Bearer <key>" }, { "www-authenticate": "Bearer" }); return; }

    let rpc;
    try { rpc = JSON.parse(body || "null"); } catch { sendJson(response, 400, { error: "SYNTHETIC: invalid JSON" }); return; }
    const id = rpc?.id ?? null;
    const location = rpc?.params?.arguments?.location ?? {};
    if (rpc?.method !== "tools/call" || rpc?.params?.name !== "hazards_at_location") {
      sendJson(response, 200, { jsonrpc: "2.0", id, error: { code: -32601, message: "SYNTHETIC: only hazards_at_location is stubbed" } });
      return;
    }
    const payload = syntheticHazards(Number(location.lat), Number(location.lon));

    switch (url.pathname) {
      case "/mcp/redirect":
        response.writeHead(302, { location: "/mcp" }); response.end(); return;
      case "/mcp/html":
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end("<html>SYNTHETIC</html>"); return;
      case "/mcp/oversize": {
        // Chunked, no Content-Length: the adapter has to count while streaming.
        response.writeHead(200, { "content-type": "application/json" });
        const chunk = Buffer.alloc(64 * 1024, 0x20);
        let sent = 0;
        const push = () => {
          while (sent < STUB_OVERSIZE_BYTES && !response.destroyed) {
            sent += chunk.length;
            if (!response.write(chunk)) { response.once("drain", push); return; }
          }
          if (!response.destroyed) response.end("{}");
        };
        response.write("[");
        push();
        return;
      }
      case "/mcp/oversize-declared":
        response.writeHead(200, { "content-type": "application/json", "content-length": String(STUB_OVERSIZE_BYTES) });
        response.write("{"); // never finishes; a reader that trusts the header would wait
        open.add(response);
        return;
      case "/mcp/hang":
        open.add(response); return;
      case "/mcp/slow-body":
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write("event: message\r\n");
        open.add(response);
        return;
      case "/mcp/rate-limited":
        sendJson(response, 429, { error: "SYNTHETIC: too many requests" }, { "retry-after": "30" }); return;
      case "/mcp/tool-error":
        sendJson(response, 200, rpcResult(id, { error: "SYNTHETIC tool failure" }, true)); return;
      case "/mcp/wrong-id":
        sendJson(response, 200, rpcResult(typeof id === "number" ? id + 1 : 99, payload)); return;
      case "/mcp": {
        if (url.searchParams.get("format") === "json") { sendJson(response, 200, rpcResult(id, payload)); return; }
        const text = `event: message\r\ndata: ${JSON.stringify(rpcResult(id, payload))}\r\n\r\n`;
        response.writeHead(200, { "content-type": "text/event-stream", "content-length": Buffer.byteLength(text) });
        response.end(text);
        return;
      }
      default:
        sendJson(response, 404, { error: "SYNTHETIC: unknown path" });
    }
  });
  server.on("connection", (socket) => { open.add(socket); socket.on("close", () => open.delete(socket)); });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      const baseUrl = `http://${host}:${actualPort}`;
      const close = () => new Promise((done) => {
        for (const item of open) { try { item.destroy(); } catch { /* already gone */ } }
        server.close(() => done());
      });
      resolve({ baseUrl, mcpUrl: `${baseUrl}/mcp`, port: actualPort, key, requests, close });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? process.env.GIS_STUB_PORT ?? 8765);
  const key = process.env.GIS_STUB_KEY ?? STUB_DEFAULT_KEY;
  const stub = await startGisStub({ port, key });
  console.log(`SYNTHETIC Glendale GIS MCP stub on ${stub.mcpUrl} (not real data; loopback only; Ctrl+C to stop)`);
  const stop = () => stub.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
