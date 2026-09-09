import { PHOTO_SIZE_TOO_LARGE } from "./studentPhoto";

export const MAX_SCHOOL_LOGO_BYTES = 2 * 1024 * 1024;
const TARGET_LOGO_BYTES = 400 * 1024;
const MAX_LOGO_DIMENSION = 512;

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

function compressLogoCanvas(canvas: HTMLCanvasElement): string {
  let quality = 0.88;
  let dataUrl = canvas.toDataURL("image/png");
  if (logoBytesFromDataUrl(dataUrl) <= TARGET_LOGO_BYTES) return dataUrl;

  quality = 0.82;
  dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (logoBytesFromDataUrl(dataUrl) > TARGET_LOGO_BYTES && quality > 0.45) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

export async function prepareSchoolLogoFromFile(file: File): Promise<string> {
  const sizeErr = validateLogoFileSize(file.size);
  if (sizeErr) throw new Error(sizeErr);

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare logo image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = compressLogoCanvas(canvas);
  const afterErr = validateLogoFileSize(logoBytesFromDataUrl(dataUrl));
  if (afterErr) throw new Error(afterErr);
  return dataUrl;
}
