export const MAX_STUDENT_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_SIZE_TOO_LARGE = "FILE SIZE IS LARGE";
export const MAX_STUDENT_PHOTO_MB = 10;

export function validatePhotoFileSize(byteLength: number): string | null {
  if (byteLength > MAX_STUDENT_PHOTO_BYTES) return PHOTO_SIZE_TOO_LARGE;
  return null;
}

export function validatePhotoDataUrlSize(dataUrl: string): string | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (!match) return null;
  const b64 = match[1];
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - padding;
  return validatePhotoFileSize(bytes);
}

export function uploadTooLargeMessage(status: number): string | null {
  if (status === 413) {
    return `${PHOTO_SIZE_TOO_LARGE} — photo upload exceeds server limit (max ${MAX_STUDENT_PHOTO_MB} MB).`;
  }
  return null;
}

export function registrationPayloadTooLargeMessage(payloadJson: string): string | null {
  if (payloadJson.length <= 4_000_000) return null;
  return `${PHOTO_SIZE_TOO_LARGE} — photo upload is too big for the server. Re-select the photo (max ${MAX_STUDENT_PHOTO_MB} MB).`;
}

export function prepareStudentPhotoFromAsset(asset: {
  base64?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}): string {
  if (!asset.base64) {
    throw new Error("Could not read the photo.");
  }
  const byteLength =
    typeof asset.fileSize === "number"
      ? asset.fileSize
      : Math.floor((asset.base64.length * 3) / 4);
  const sizeErr = validatePhotoFileSize(byteLength);
  if (sizeErr) {
    throw new Error(sizeErr);
  }
  const mime = asset.mimeType || "image/jpeg";
  const dataUrl = `data:${mime};base64,${asset.base64}`;
  const afterErr = validatePhotoDataUrlSize(dataUrl);
  if (afterErr) {
    throw new Error(
      `${PHOTO_SIZE_TOO_LARGE} — pick a smaller photo (max ${MAX_STUDENT_PHOTO_MB} MB).`
    );
  }
  return dataUrl;
}
