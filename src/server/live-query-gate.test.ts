import { afterEach, describe, expect, it, vi } from "vitest";
import { demoLiveSourcesEnabled } from "./live-query-gate";

afterEach(() => vi.unstubAllEnvs());
describe("local-only live source demo gate", () => {
  it("defaults off and never enables production source queries", () => {
    vi.stubEnv("FIREPOINT_DEMO_LIVE_SOURCES", "");
    expect(demoLiveSourcesEnabled()).toBe(false);
    vi.stubEnv("FIREPOINT_DEMO_LIVE_SOURCES", "enabled");
    vi.stubEnv("NODE_ENV", "production");
    expect(demoLiveSourcesEnabled()).toBe(false);
  });
  it("can be enabled deliberately for local nonproduction source integration", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIREPOINT_DEMO_LIVE_SOURCES", "enabled");
    expect(demoLiveSourcesEnabled()).toBe(true);
  });
});
