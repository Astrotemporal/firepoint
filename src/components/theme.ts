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
