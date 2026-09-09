import { PHOTO_SIZE_TOO_LARGE } from "./studentPhoto";

export const MAX_SCHOOL_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_SCHOOL_LOGO_MB = 2;

function logoBytesFromDataUrl(dataUrl: string): number {
  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (!match) return dataUrl.length;
  const b64 = match[1];
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function validateLogoFileSize(byteLength: number): string | null {
  if (byteLength > MAX_SCHOOL_LOGO_BYTES) return PHOTO_SIZE_TOO_LARGE;
  return null;
}

export function prepareSchoolLogoFromAsset(asset: {
  base64?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}): string {
  if (!asset.base64) {
    throw new Error("Could not read the logo.");
  }
  const byteLength =
    typeof asset.fileSize === "number"
      ? asset.fileSize
      : Math.floor((asset.base64.length * 3) / 4);
  const sizeErr = validateLogoFileSize(byteLength);
  if (sizeErr) {
    throw new Error(`${sizeErr} — logo must be ${MAX_SCHOOL_LOGO_MB} MB or smaller.`);
  }
  const mime = asset.mimeType || "image/jpeg";
  const dataUrl = `data:${mime};base64,${asset.base64}`;
  const afterErr = validateLogoFileSize(logoBytesFromDataUrl(dataUrl));
  if (afterErr) {
    throw new Error(`${afterErr} — logo must be ${MAX_SCHOOL_LOGO_MB} MB or smaller.`);
  }
  return dataUrl;
}
