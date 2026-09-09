import { apiBaseUrl, isDesktopRuntime } from "../api/config";

export type PublicBranding = {
  schoolName: string;
  schoolLogoUrl: string | null;
};

const DEFAULT_SCHOOL = "Izzy Tech Team School";
const DEFAULT_FAVICON = "/favicon.svg";

export function resolveMediaUrl(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${apiBaseUrl()}${path}`;
}

function faviconMimeType(url: string): string {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

/** Apply school name + logo to the browser tab (title + favicon). */
export function applySiteBranding(branding: Partial<PublicBranding>) {
  const schoolName = branding.schoolName?.trim() || DEFAULT_SCHOOL;
  document.title = isDesktopRuntime() ? "MPASAT" : `${schoolName} — MPASAT`;

  const link =
    document.querySelector<HTMLLinkElement>('link[data-site-favicon="true"]') ??
    document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;

  const logoUrl = branding.schoolLogoUrl ? resolveMediaUrl(branding.schoolLogoUrl) : DEFAULT_FAVICON;
  const bust = branding.schoolLogoUrl ? `?v=${Date.now()}` : "";
  link.href = `${logoUrl}${bust}`;
  link.type = faviconMimeType(logoUrl);
}

export function defaultPublicBranding(): PublicBranding {
  return { schoolName: DEFAULT_SCHOOL, schoolLogoUrl: null };
}
