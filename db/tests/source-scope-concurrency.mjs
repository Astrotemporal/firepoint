/** Synthetic-only concurrency test against a disposable Postgres Docker service. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

const container = process.argv[2];
if (!container || !/^[a-zA-Z0-9_.-]+$/.test(container)) {
  throw new Error("pass a disposable PostgreSQL Docker container ID or name");
}
const args = ["exec", "-i", container, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
const registry = "11111111-1111-4111-8111-111111111111";
const scope = "'synthetic-concurrency','us.ca.glendale'";
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const genA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const genB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function run(input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}
function session() {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  const state = { child, output: "" };
  child.stdout.on("data", (chunk) => { state.output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { state.output += chunk.toString(); });
  return state;
}
function waitFor(state, marker, ms = 10000) {
  return new Promise((resolve, reject) => {
    if (state.output.includes(marker)) return resolve();
    const timer = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${marker}: ${state.output}`)); }, ms);
    const onData = () => { if (state.output.includes(marker)) { cleanup(); resolve(); } };
    const onExit = (code) => { cleanup(); reject(new Error(`psql exited ${code} before ${marker}: ${state.output}`)); };
    function cleanup() {
      clearTimeout(timer);
      state.child.stdout.off("data", onData);
      state.child.stderr.off("data", onData);
      state.child.off("exit", onExit);
    }
    state.child.stdout.on("data", onData);
    state.child.stderr.on("data", onData);
    state.child.on("exit", onExit);
  });
}
function waitExit(state) {
  return new Promise((resolve, reject) => {
    if (state.child.exitCode !== null) return resolve(state.child.exitCode);
    const timer = setTimeout(() => { reject(new Error(`psql exit timeout: ${state.output}`)); }, 10000);
    state.child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
  });
}
run(`INSERT INTO source_registry
(id,tenant_id,jurisdiction_id,source_key,registry_class,display_name,issuer,source_url,
record_kinds,coverage_status,rights_status,empty_ok,empty_result_meaning,
production_auto_polling_enabled,notes,created_at,updated_at)
VALUES ('${registry}',${scope},'synthetic-concurrency','official-live-candidate',
'Synthetic concurrency','Synthetic Agency','https://example.org/synthetic',ARRAY['shelter-status'],
'validated-complete-for-scope','storage-approved',true,'not-all-clear',false,
'synthetic only','2026-09-27T00:00:00Z','2026-09-27T00:00:00Z');
INSERT INTO source_fetch_attempt
(id,source_registry_id,tenant_id,jurisdiction_id,status,started_at,rows_seen,rows_accepted,
complete_snapshot,empty_ok)
VALUES ('${a}','${registry}',${scope},'started','2026-09-27T01:00:00Z',0,0,false,true),
('${b}','${registry}',${scope},'started','2026-09-27T01:01:00Z',0,0,false,true);
UPDATE source_fetch_attempt SET status='succeeded-empty',complete_snapshot=true,
completed_at='2026-09-27T01:02:00Z' WHERE id='${a}';
UPDATE source_fetch_attempt SET status='succeeded-empty',complete_snapshot=true,
completed_at='2026-09-27T01:03:00Z' WHERE id='${b}';`);

function generation(id, attempt, number, fetched) {
  return `INSERT INTO source_generation
(id,source_registry_id,fetch_attempt_id,tenant_id,jurisdiction_id,generation_number,
issuer,source_url,source_vintage,fetched_at,record_count,complete_snapshot,
empty_result_meaning,created_at)
VALUES ('${id}','${registry}','${attempt}',${scope},${number},'Synthetic Agency',
'https://example.org/synthetic','synthetic','${fetched}',0,true,'not-all-clear','${fetched}');`;
}
const first = session();
let second;
try {
  first.child.stdin.write(`BEGIN;
${generation(genA, a, 1, "2026-09-27T01:02:00Z")}
SELECT 'GEN1_INSERTED';
`);
  await waitFor(first, "GEN1_INSERTED");
  second = session();
  second.child.stdin.write(`BEGIN;
${generation(genB, b, 2, "2026-09-27T01:03:00Z")}
SELECT 'GEN2_INSERTED';
`);
  // The second INSERT must wait on the registry row lock held by the first.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(second.child.exitCode, null, `second fetch exited before first commit: ${second.output}`);
  assert.equal(second.output.includes("GEN2_INSERTED"), false, "second fetch bypassed registry lock");
  first.child.stdin.write(`COMMIT;
SELECT 'GEN1_COMMITTED';
`);
  await waitFor(first, "GEN1_COMMITTED");
  const exit = await waitExit(second);
  assert.notEqual(exit, 0, "stale overlapping fetch unexpectedly published generation");
  assert.match(second.output, /stale or forked source generation/);
  const count = run(`SELECT count(*) FROM source_generation WHERE source_registry_id='${registry}';`);
  assert.equal(count.trim(), "1", `unexpected generation count: ${count}`);
  console.log("synthetic concurrent stale generation rejected after first commit");
} finally {
  first.child.stdin.end();
  if (second) second.child.stdin.end();
  first.child.kill();
  if (second) second.child.kill();
}
