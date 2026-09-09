import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  persistTheme,
  readStoredTheme,
  applyDocumentTheme,
  type ColorScheme,
} from "../theme/appearance";

type ThemeCtx = {
  scheme: ColorScheme;
  setScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>(() => {
    if (typeof document === "undefined") return "light";
    const initial = readStoredTheme();
    applyDocumentTheme(initial);
    return initial;
  });

  const setScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    persistTheme(next);
  }, []);

  const value = useMemo(() => ({ scheme, setScheme }), [scheme, setScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
