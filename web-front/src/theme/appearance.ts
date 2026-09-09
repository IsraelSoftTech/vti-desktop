export const THEME_KEY = "appearance_theme";

export type ColorScheme = "light" | "dark";

export function readStoredTheme(): ColorScheme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyDocumentTheme(scheme: ColorScheme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", scheme);
  root.style.colorScheme = scheme;
}

export function persistTheme(scheme: ColorScheme) {
  try {
    localStorage.setItem(THEME_KEY, scheme);
  } catch {
    /* ignore quota / private mode */
  }
  applyDocumentTheme(scheme);
}
