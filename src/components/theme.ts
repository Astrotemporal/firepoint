export type Theme = "light" | "dark";

export const THEME_KEY = "firepoint.theme.v1";

/** Runs before first paint so a saved or system dark theme never flashes light. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch { return null; }
}

export function applyTheme(theme: Theme, remember: boolean) {
  document.documentElement.dataset.theme = theme;
  if (!remember) return;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* The toggle still works for this visit. */ }
}

/**
 * Notifies on every change to <html data-theme>, and follows the system setting until someone picks a theme.
 * Shaped for useSyncExternalStore with `currentTheme` as the snapshot.
 */
export function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const follow = () => { if (!storedTheme()) applyTheme(system.matches ? "dark" : "light", false); };
  system.addEventListener("change", follow);
  return () => { observer.disconnect(); system.removeEventListener("change", follow); };
}
