import { afterEach, describe, expect, it, vi } from "vitest";
import { unverifiedRoutingPrototypeEnabled } from "./release-gate";

afterEach(() => vi.unstubAllEnvs());

describe("unverified routing prototype gate", () => {
  it("is off by default in every environment", () => {
    vi.stubEnv("FIREPOINT_PROTOTYPE_ROUTING", "");
    for (const env of ["development", "test", "production"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(unverifiedRoutingPrototypeEnabled()).toBe(false);
    }
  });

  it("stays off in production builds even when the flag is set (Vercel Production and Preview)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREPOINT_PROTOTYPE_ROUTING", "enabled");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(unverifiedRoutingPrototypeEnabled()).toBe(false);
  });

  it("ignores lookalike values and browser-exposed NEXT_PUBLIC_ variables", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_FIREPOINT_PROTOTYPE_ROUTING", "enabled");
    expect(unverifiedRoutingPrototypeEnabled()).toBe(false);
    for (const value of ["true", "1", "yes", "ENABLED", "enabled "]) {
      vi.stubEnv("FIREPOINT_PROTOTYPE_ROUTING", value);
      expect(unverifiedRoutingPrototypeEnabled()).toBe(false);
    }
  });

  it("turns on only for a deliberate nonproduction run", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIREPOINT_PROTOTYPE_ROUTING", "enabled");
    expect(unverifiedRoutingPrototypeEnabled()).toBe(true);
  });
});
