// CI/local smoke for the Glendale GIS route wiring, entirely on this machine.
//
// 1. Starts the SYNTHETIC loopback stub (scripts/gis-mcp-stub.mjs).
// 2. Runs `next dev` pointed at it and checks POST /api/v1/hazards/query returns the
//    synthetic feed (200, allClear:false) and that only user-initiated bodies reach the stub.
// 3. Runs `next start` (a production build) with the same env and checks the route stays
//    paused (503) and makes NO upstream call, even with the demo flag and a key set.
//
// Nothing here contacts the hosted Cloud Run MCP, Vercel, or uses a real key. Requires a
// prior `npm run build` for step 3.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { startGisStub } from "./gis-mcp-stub.mjs";

const ROUTE = "/api/v1/hazards/query";
const BODY = JSON.stringify({ point: [-118.25, 34.15], userInitiated: true });
const READY_MS = 180_000;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

function startNext(mode, port, env) {
  const child = spawn("npm", ["run", mode, "--", "--port", String(port), "--hostname", "127.0.0.1"], {
    env: { ...process.env, ...env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk; });
  child.stderr.on("data", (chunk) => { log += chunk; });
  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once("exit", () => resolve());
    const signalGroup = (signal) => { if (process.platform === "win32") child.kill(); else process.kill(-child.pid, signal); };
    try { signalGroup("SIGTERM"); } catch { resolve(); }
    setTimeout(() => { try { signalGroup("SIGKILL"); } catch { /* gone */ } }, 5_000).unref();
    // Never wait forever on a stubborn process tree; the runner reaps orphans.
    setTimeout(resolve, 8_000).unref();
  });
  return { child, stop, log: () => log };
}

async function post(base, body, headers = { "content-type": "application/json" }) {
  const response = await fetch(`${base}${ROUTE}`, { method: "POST", headers, body });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, json, text };
}

async function waitForRoute(base, child) {
  const deadline = Date.now() + READY_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next exited early with ${child.exitCode}`);
    try {
      const { status } = await post(base, "{}");
      if (status === 400 || status === 503) return; // the route module answered
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("next did not serve the hazards route in time");
}

function check(condition, message) {
  if (!condition) throw new Error(`Smoke check failed: ${message}`);
  console.log(`ok - ${message}`);
}

const stub = await startGisStub({ port: 0 });
console.log(`SYNTHETIC stub listening at ${stub.mcpUrl}`);
const env = {
  GLENDALE_GIS_MCP_URL: stub.mcpUrl,
  GLENDALE_GIS_MCP_KEY: stub.key,
  FIREPOINT_DEMO_LIVE_SOURCES: "enabled",
};
let app;
try {
  // --- next dev: the local demo path may call the loopback stub -------------------------
  const devPort = await freePort();
  app = startNext("dev", devPort, env);
  const devBase = `http://127.0.0.1:${devPort}`;
  await waitForRoute(devBase, app.child);
  stub.requests.length = 0;

  const ok = await post(devBase, BODY);
  check(ok.status === 200, `next dev route answers 200 (got ${ok.status})`);
  check(ok.json?.allClear === false, "feed never claims an all-clear");
  check(ok.json?.sourceChecks?.[0]?.status === "ok", `source check is ok (got ${ok.json?.sourceChecks?.[0]?.status})`);
  check(Array.isArray(ok.json?.hazards) && ok.json.hazards.length === 7, "seven hazard layers mapped");
  check(ok.json.hazards.every((h) => String(h.dataset).startsWith("SYNTHETIC")), "every layer is labelled SYNTHETIC");
  check(!ok.text.includes(stub.key), "the key is not echoed to the client");
  check(stub.requests.length === 1 && stub.requests[0].authorized && stub.requests[0].path === "/mcp", "exactly one authorized stub call");

  const notUser = await post(devBase, JSON.stringify({ point: [-118.25, 34.15], userInitiated: false }));
  check(notUser.status === 400, `userInitiated:false is refused (got ${notUser.status})`);
  const big = await post(devBase, JSON.stringify({ point: [-118.25, 34.15], userInitiated: true, pad: "x".repeat(1100) }));
  check(big.status === 413, `oversize body is refused (got ${big.status})`);
  check(stub.requests.length === 1, "refused bodies never reach the stub");
  await app.stop();

  // --- next start: a production build must stay paused --------------------------------
  const prodPort = await freePort();
  app = startNext("start", prodPort, env);
  const prodBase = `http://127.0.0.1:${prodPort}`;
  await waitForRoute(prodBase, app.child);
  stub.requests.length = 0;
  const paused = await post(prodBase, BODY);
  check(paused.status === 503, `production build answers 503 (got ${paused.status})`);
  check(/paused/.test(paused.json?.error ?? ""), "production build reports live checks paused");
  check(stub.requests.length === 0, "production build made no upstream call");
  await app.stop();
  console.log("GIS stub smoke passed");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (app) console.error(app.log().slice(-4000));
  process.exitCode = 1;
} finally {
  if (app) await app.stop();
  await stub.close();
  // Exit explicitly: a surviving pipe or keep-alive socket must not hold the CI step open.
  const lingering = process.getActiveResourcesInfo?.().filter((kind) => kind !== "TTYWrap") ?? [];
  if (lingering.length) console.log(`exiting with lingering handles: ${lingering.join(", ")}`);
  process.exit(process.exitCode ?? 0);
}
