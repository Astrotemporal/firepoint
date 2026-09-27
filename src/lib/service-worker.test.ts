import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

/*
 * Runs public/sw.js in a sandbox with an in-memory Cache API. The worker must never store a homepage that is
 * not the public no-data screen, and a successful update must purge every cache left by the pre-gate worker.
 */

const ORIGIN = "https://firepoint.example";
const SOURCE = readFileSync("public/sw.js", "utf8");
/** Namespaces the prototype worker used; a device that updates must lose them. */
const RETIRED = ["firepoint-shell-v4", "firepoint-assets-v3", "firepoint-shell-v1", "firepoint-assets-v1"];
const PUBLIC_HOME = '<main lang="en" class="map-screen ev-shell ev-shell-static"><script src="/_next/static/chunks/a.js"></script></main>';
const PROTOTYPE_HOME = '<main class="map-screen ev-shell"><button class="ev-escape-cta">Escape</button></main>';

class FakeCache {
  store = new Map<string, Response>();
  async put(key: Request | string, response: Response) { this.store.set(typeof key === "string" ? key : key.url, response); }
  async add(url: string) { const response = await sandbox.fetch(url); if (!response.ok) throw new Error("bad"); await this.put(url, response); }
  async addAll(urls: string[]) { await Promise.all(urls.map((url) => this.add(url))); }
  async match(key: Request | string) { return this.store.get(typeof key === "string" ? key : key.url); }
  async keys() { return [...this.store.keys()].map((url) => new Request(url)); }
  async delete(key: Request | string) { return this.store.delete(typeof key === "string" ? key : key.url); }
}
class FakeCaches {
  caches = new Map<string, FakeCache>();
  async open(name: string) { if (!this.caches.has(name)) this.caches.set(name, new FakeCache()); return this.caches.get(name)!; }
  async keys() { return [...this.caches.keys()]; }
  async delete(name: string) { return this.caches.delete(name); }
  async match(key: Request | string) { for (const cache of this.caches.values()) { const hit = await cache.match(key); if (hit) return hit; } return undefined; }
}

type Listener = (event: { request?: Request; waitUntil: (p: Promise<unknown>) => void; respondWith: (p: Promise<Response>) => void }) => void;
const sandbox = {
  listeners: new Map<string, Listener>(),
  caches: new FakeCaches(),
  fetch: async (input: Request | string): Promise<Response> => { void input; throw new TypeError("offline"); },
  Response, Request, URL,
  self: {} as Record<string, unknown>,
};

function load() {
  sandbox.listeners = new Map();
  sandbox.caches = new FakeCaches();
  sandbox.self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => sandbox.listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  vm.runInNewContext(SOURCE, {
    self: sandbox.self, caches: sandbox.caches, Response, Request, URL,
    fetch: (input: Request | string) => sandbox.fetch(input), console,
  });
}

async function dispatch(type: "install" | "activate") {
  const pending: Promise<unknown>[] = [];
  sandbox.listeners.get(type)!({ waitUntil: (p) => pending.push(p), respondWith: () => undefined });
  await Promise.all(pending);
}

async function navigate(url: string): Promise<Response> {
  let out: Promise<Response> | undefined;
  const request = new Request(url, { method: "GET" });
  Object.defineProperty(request, "mode", { value: "navigate" });
  sandbox.listeners.get("fetch")!({ request, waitUntil: () => undefined, respondWith: (p) => { out = p; } });
  return out!;
}

const html = (body: string, init: ResponseInit & { url?: string; redirected?: boolean } = {}) => {
  const response = new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });
  Object.defineProperty(response, "url", { value: init.url ?? `${ORIGIN}/` });
  if (init.redirected) Object.defineProperty(response, "redirected", { value: true });
  return response;
};
const onlineWith = (home: () => Response) => async (input: Request | string) => {
  const path = new URL(typeof input === "string" ? input : input.url, ORIGIN).pathname;
  if (path === "/") return home();
  return new Response(`asset ${path}`, { status: 200 });
};

beforeEach(load);

describe("service worker cache migration", () => {
  it("uses fresh namespaces, not the ones the pre-gate prototype worker filled", () => {
    const names = [...SOURCE.matchAll(/const (CACHE|ASSETS) = "([^"]+)"/g)].map((m) => m[2]);
    expect(names).toHaveLength(2);
    for (const name of names) expect(RETIRED, name).not.toContain(name);
    expect(names.every((name) => name.startsWith("firepoint-"))).toBe(true);
  });

  it("purges every older firepoint-* cache on activate, including a cached prototype homepage", async () => {
    for (const name of RETIRED) (await sandbox.caches.open(name)).put("/", html(PROTOTYPE_HOME));
    (await sandbox.caches.open("unrelated-v1")).put("/x", new Response("keep"));
    sandbox.fetch = onlineWith(() => html(PUBLIC_HOME));
    await dispatch("install");
    await dispatch("activate");
    const remaining = await sandbox.caches.keys();
    for (const name of RETIRED) expect(remaining, name).not.toContain(name);
    expect(remaining).toContain("unrelated-v1");
    const home = await sandbox.caches.match("/");
    expect(await home?.text()).toContain("ev-shell-static");
  });

  it("never stores a homepage that is not the public screen: prototype markup, login redirects, errors", async () => {
    for (const home of [
      () => html(PROTOTYPE_HOME),
      () => html(PUBLIC_HOME, { redirected: true, url: "https://vercel.com/login" }),
      () => html(PUBLIC_HOME, { redirected: true }),
      () => html(PUBLIC_HOME, { status: 503 }),
    ]) {
      load();
      sandbox.fetch = onlineWith(home);
      await dispatch("install");
      await navigate(`${ORIGIN}/`);
      expect(await sandbox.caches.match("/")).toBeUndefined();
      // The static offline page is still installed, so an offline "/" gets it instead of nothing.
      expect(await sandbox.caches.match("/offline.html")).toBeDefined();
    }
  });

  it("serves the offline page, never a stale homepage, when offline with nothing public cached", async () => {
    (await sandbox.caches.open("firepoint-shell-v4")).put("/", html(PROTOTYPE_HOME));
    sandbox.fetch = onlineWith(() => html(PUBLIC_HOME, { redirected: true, url: "https://vercel.com/login" }));
    await dispatch("install");
    await dispatch("activate");
    sandbox.fetch = async () => { throw new TypeError("offline"); };
    const response = await navigate(`${ORIGIN}/`);
    expect(await response.text()).toContain("asset /offline.html");
  });

  it("keeps the public homepage for offline use after a normal online visit", async () => {
    sandbox.fetch = onlineWith(() => html(PUBLIC_HOME));
    await dispatch("install");
    await dispatch("activate");
    sandbox.fetch = async () => { throw new TypeError("offline"); };
    const response = await navigate(`${ORIGIN}/`);
    expect(await response.text()).toContain("ev-shell-static");
  });

  it("checks the same marker the public screen renders", () => {
    const marker = /const PUBLIC_SHELL_MARKER = "([^"]+)"/.exec(SOURCE)?.[1];
    expect(marker).toBe("ev-shell-static");
    expect(readFileSync("src/components/public-map-screen.tsx", "utf8")).toContain(`className="map-screen ev-shell ${marker}"`);
    expect(readFileSync("src/components/map-screen.tsx", "utf8")).not.toContain(marker!);
  });
});
