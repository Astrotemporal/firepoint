import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageSelect } from "./language-select";
import { MapScreen } from "./map-screen";
import { WildfireGuide } from "./wildfire-guide";

describe("language select", () => {
  it("offers EN, ES and AM with the current language selected", () => {
    const html = renderToStaticMarkup(<LanguageSelect current="hy" label="Լեզու" returnTo="/" />);
    expect(html).toContain('aria-label="Լեզու"');
    expect(html).toMatch(/<option value="en" lang="en"[^>]*>EN<\/option>/);
    expect(html).toMatch(/<option value="es" lang="es"[^>]*>ES<\/option>/);
    expect(html).toMatch(/<option value="hy" lang="hy"[^>]*selected=""[^>]*>AM<\/option>/);
  });

  it("falls back to plain links that return to the same page without JavaScript", () => {
    const html = renderToStaticMarkup(<LanguageSelect current="en" label="Language" returnTo="/" />);
    expect(html).toContain("<noscript>");
    expect(html).toContain('href="/api/lang?to=es&amp;next=%2F"');
  });

  it("sits in the top-right controls of the map and the guide", () => {
    const map = renderToStaticMarkup(<MapScreen locale="es" />);
    const actions = map.slice(map.indexOf('class="map-actions"'));
    expect(actions.indexOf("lang-select")).toBeGreaterThan(-1);
    expect(actions.indexOf("lang-select")).toBeLessThan(actions.indexOf("theme-toggle"));
    expect(map).toContain('aria-label="Idioma"');

    const guide = renderToStaticMarkup(<WildfireGuide locale="es" />);
    const header = guide.slice(guide.indexOf('class="g-appbar"'), guide.indexOf("</header>"));
    expect(header).toContain("lang-select");
    expect(header).toMatch(/<option value="es"[^>]*selected=""/);
  });
});
