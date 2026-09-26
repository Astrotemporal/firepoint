// Development only: run the Glendale GIS MCP over HTTP on this machine, so
// POST /api/v1/hazards/query works without the hackathon's hosted-server key.
// Point .env.local at it with a made-up local key:
//   GLENDALE_GIS_MCP_URL=http://127.0.0.1:8765/mcp
//   GLENDALE_GIS_MCP_KEY=<any local-only value>
// The server version is the commit pinned in .mcp.json. Requires uv (uvx).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function readEnv(file) {
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

let env;
try { env = readEnv(".env.local"); } catch {
  console.error("No .env.local found. Copy .env.example to .env.local first.");
  process.exit(1);
}
const url = new URL(env.GLENDALE_GIS_MCP_URL || "http://127.0.0.1:8765/mcp");
const key = env.GLENDALE_GIS_MCP_KEY;
if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
  console.error(`GLENDALE_GIS_MCP_URL points at ${url.host}, not this machine. Set it to http://127.0.0.1:8765/mcp for local use.`);
  process.exit(1);
}
if (!key) {
  console.error("Set GLENDALE_GIS_MCP_KEY in .env.local to any local-only value; the app and this server share it.");
  process.exit(1);
}

const pinned = JSON.parse(readFileSync(".mcp.json", "utf8")).mcpServers["glendale-gis"].args;
const port = url.port || "8765";
console.log(`Starting Glendale GIS MCP on http://127.0.0.1:${port}/mcp (Ctrl+C to stop)`);
const child = spawn("uvx", [...pinned, "--http", "--host", "127.0.0.1", "--port", port], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, GLENDALE_GIS_API_KEYS: key },
});
child.on("exit", (code) => process.exit(code ?? 0));
