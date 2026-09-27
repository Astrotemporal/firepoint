import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The layout reads the saved language from request cookies; outside a request, choose it directly.
const locale = vi.hoisted(() => ({ value: "en" as "en" | "es" | "hy" }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => locale.value }));
vi.mock("@/components/preloader", () => ({ Preloader: () => null }));

const { default: RootLayout } = await import("./layout");

async function render(value: typeof locale.value) {
  locale.value = value;
  const element = await RootLayout({ children: <p>content</p>, params: Promise.resolve({}) } as Parameters<typeof RootLayout>[0]);
  return renderToStaticMarkup(element);
}

describe("root layout", () => {
  it("tags the whole document with the chosen language", async () => {
    expect(await render("en")).toMatch(/^<html lang="en"/);
    expect(await render("es")).toMatch(/^<html lang="es"/);
    expect(await render("hy")).toMatch(/^<html lang="hy"/);
  });
});
