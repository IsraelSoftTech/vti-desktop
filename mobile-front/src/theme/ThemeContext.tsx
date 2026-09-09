import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { paletteFor, type AppColors, type ColorScheme } from "./colors";

const THEME_KEY = "appearance_theme";

type ThemeCtx = {
  scheme: ColorScheme;
  colors: AppColors;
  setScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>("light");

  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY)
      .then((saved) => {
        if (saved === "dark" || saved === "light") setSchemeState(saved);
      })
      .catch(() => {});
  }, []);

  const setScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    SecureStore.setItemAsync(THEME_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      scheme,
      colors: paletteFor(scheme),
      setScheme,
    }),
    [scheme, setScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function useColors(): AppColors {
  return useTheme().colors;
}
