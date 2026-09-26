import { describe, expect, it } from "vitest";
import { GET } from "./route";

const get = (query: string) => GET(new Request(`http://localhost/api/lang?${query}`));

describe("language switch route", () => {
  it("saves a supported language and returns to the page", () => {
    const response = get("to=hy&next=%2Fprepare");
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/prepare");
    const cookie = response.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("firepoint.lang=hy");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
  });

  it("ignores unsupported languages and never redirects off-site", () => {
    const response = get("to=xx&next=https%3A%2F%2Fevil.example");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Location")).toBe("/prepare");
    expect(get("to=es&next=%2F%2Fevil.example").headers.get("Location")).toBe("/prepare");
  });
});
