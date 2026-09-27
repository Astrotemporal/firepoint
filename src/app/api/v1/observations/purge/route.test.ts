import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("Preview purge route gate", () => {
  it("returns 503 in Production even with the preview flag and purge token", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("FIREPOINT_REPORTING_ENABLED", "preview-only");
    vi.stubEnv("FIREPOINT_PURGE_TOKEN", "synthetic-token");
    const response = await POST(new Request("http://localhost/api/v1/observations/purge", {
      method: "POST", headers: { Authorization: "Bearer synthetic-token" },
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 in Preview unless the explicit reporting flag is enabled", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("FIREPOINT_REPORTING_ENABLED", "");
    const response = await POST(new Request("http://localhost/api/v1/observations/purge", { method: "POST" }));
    expect(response.status).toBe(503);
  });
});
