export type ColorScheme = "light" | "dark";

export const lightColors = {
  background: "#F0F1F2",
  backgroundAlt: "#F9FAFB",
  surface: "#FFFFFF",
  primary: "#1E3A8A",
  primaryDark: "#182E6E",
  primarySoft: "#E9EBF3",
  primary200: "#DDE1ED",
  primary800: "#122353",
  secondary: "#F59E0B",
  secondarySoft: "#FEF7E7",
  text: "#565B66",
  textSub: "#606773",
  textMuted: "#6B7280",
  border: "#D1D3D8",
  borderStrong: "#D1D5DB",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  success: "#16A34A",
  successSoft: "#F0FDF4",
  warning: "#F97316",
  reserved: "#D09C0B",
  reservedBg: "#FEF8E7",
  accentTeal: "#16A34A",
  accentTealSoft: "#F0FDF4",
  accentPeach: "#F59E0B",
  accentPeachSoft: "#FEF7E7",
  accentPurple: "#1E3A8A",
  white: "#FFFFFF",
  shadow: "rgba(30, 58, 138, 0.12)",
  headerStart: "#1E3A8A",
  headerEnd: "#182E6E",
} as const;

export const darkColors = {
  background: "#0B1220",
  backgroundAlt: "#111827",
  surface: "#162033",
  primary: "#93B4FF",
  primaryDark: "#6B8AE6",
  primarySoft: "#1E2A4A",
  primary200: "#243056",
  primary800: "#C7D2FE",
  secondary: "#F59E0B",
  secondarySoft: "#3F2E10",
  text: "#E5E7EB",
  textSub: "#CBD5E1",
  textMuted: "#94A3B8",
  border: "#2A3A55",
  borderStrong: "#3B4D6B",
  danger: "#F87171",
  dangerSoft: "#3F1D1D",
  success: "#4ADE80",
  successSoft: "#14532D",
  warning: "#FB923C",
  reserved: "#FBBF24",
  reservedBg: "#3F2E10",
  accentTeal: "#4ADE80",
  accentTealSoft: "#14532D",
  accentPeach: "#F59E0B",
  accentPeachSoft: "#3F2E10",
  accentPurple: "#93B4FF",
  white: "#FFFFFF",
  shadow: "rgba(0, 0, 0, 0.45)",
  headerStart: "#1E3A8A",
  headerEnd: "#182E6E",
} as const;

export type AppColors = { [K in keyof typeof lightColors]: string };

/** Light palette for print/PDF and fallbacks. Prefer `useColors()` in UI. */
export const colors: AppColors = { ...lightColors };

export function paletteFor(scheme: ColorScheme): AppColors {
  return scheme === "dark" ? { ...darkColors } : { ...lightColors };
}
