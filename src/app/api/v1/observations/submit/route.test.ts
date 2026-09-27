import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as AggregateGET } from "../aggregate/route";
import { GET as ModerationGET } from "../moderation/route";
import { POST } from "./route";

const validBody = {
  userInitiated: true, topic: "smoke", text: "Visible smoke from my block", observedAt: null,
  approximatePoint: [-118.24, 34.16], precisionMeters: 800,
  consent: { submitObservation: true, publishIfApproved: true, retentionDays: 14 }, website: "",
};
const submitRequest = () => new Request("http://localhost/api/v1/observations/submit", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validBody),
});

afterEach(() => vi.unstubAllEnvs());

describe("community observation routes", () => {
  it("stay off outside Vercel Preview even if a database URL is present", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://synthetic-secret@example.invalid/db");
    vi.stubEnv("FIREPOINT_REPORTING_ENABLED", "preview-only");
    vi.stubEnv("VERCEL_ENV", "production");
    const submit = await POST(submitRequest());
    expect(submit.status).toBe(503);
    expect(await submit.json()).toMatchObject({ error: expect.stringContaining("disabled") });
    expect((await AggregateGET()).status).toBe(503);
    expect((await ModerationGET(new Request("http://localhost/api/v1/observations/moderation"))).status).toBe(503);
  });

  it("fails closed in Preview until DATABASE_URL and server secrets are provisioned", async () => {
    vi.stubEnv("FIREPOINT_REPORTING_ENABLED", "preview-only");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("DATABASE_URL", "");
    const response = await POST(submitRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("database") });
  });
});
