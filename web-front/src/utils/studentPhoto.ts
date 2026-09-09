export const MAX_STUDENT_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_SIZE_TOO_LARGE = "FILE SIZE IS LARGE";
export const MAX_STUDENT_PHOTO_MB = 10;

/** Keep uploads light for fast list views and ID cards. */
const TARGET_PHOTO_BYTES = 500 * 1024;
const MAX_IMAGE_DIMENSION = 800;
const MIN_IMAGE_DIMENSION = 480;

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

export function validatePhotoFile(file: File): string | null {
  return validatePhotoFileSize(file.size);
}

/** Shrink large camera photos so uploads work through production proxies. */
export async function prepareStudentPhotoFromFile(file: File): Promise<string> {
  const sizeErr = validatePhotoFile(file);
  if (sizeErr) throw new Error(sizeErr);

  const compressed = await compressImageFile(file);
  const afterErr = validatePhotoDataUrlSize(compressed);
  if (afterErr) {
    throw new Error(
      `${PHOTO_SIZE_TOO_LARGE} — try a smaller photo (max ${MAX_STUDENT_PHOTO_MB} MB).`
    );
  }
  return compressed;
}

function photoBytesFromDataUrl(dataUrl: string): number {
  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (!match) return dataUrl.length;
  const b64 = match[1];
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality);
}

function compressCanvasToTarget(canvas: HTMLCanvasElement): string | null {
  let quality = 0.82;
  let dataUrl = encodeJpeg(canvas, quality);
  while (photoBytesFromDataUrl(dataUrl) > TARGET_PHOTO_BYTES && quality > 0.32) {
    quality -= 0.07;
    dataUrl = encodeJpeg(canvas, quality);
  }
  if (photoBytesFromDataUrl(dataUrl) > MAX_STUDENT_PHOTO_BYTES) return null;
  return dataUrl;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read the photo file. Use JPG or PNG up to 10 MB."));
    };
    img.src = objectUrl;
  });
}

function compressImageFile(file: File): Promise<string> {
  return loadImageFromFile(file).then((img) => {
    let maxSide = MAX_IMAGE_DIMENSION;
    let lastError: string | null = null;

    while (maxSide >= MIN_IMAGE_DIMENSION) {
      let { width, height } = img;
      const longest = Math.max(width, height);
      if (longest > maxSide) {
        const scale = maxSide / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not process the photo on this device.");
      }
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = compressCanvasToTarget(canvas);
      if (dataUrl) return dataUrl;

      lastError = PHOTO_SIZE_TOO_LARGE;
      maxSide = Math.round(maxSide * 0.82);
    }

    throw new Error(
      lastError
        ? `${PHOTO_SIZE_TOO_LARGE} — try a smaller photo (max ${MAX_STUDENT_PHOTO_MB} MB).`
        : "Could not optimize the photo. Try another JPG or PNG."
    );
  });
}

export function uploadTooLargeMessage(status: number): string | null {
  if (status === 413) {
    return `${PHOTO_SIZE_TOO_LARGE} — photo upload exceeds server limit (max ${MAX_STUDENT_PHOTO_MB} MB).`;
  }
  return null;
}

export function registrationPayloadTooLargeMessage(payloadJson: string): string | null {
  if (payloadJson.length <= 4_000_000) return null;
  return `${PHOTO_SIZE_TOO_LARGE} — photo upload is too big for the server. Re-select the photo (max ${MAX_STUDENT_PHOTO_MB} MB); large files are optimized automatically.`;
}

export function networkErrorMessage(apiRoot: string, body?: BodyInit | null): string {
  const api = apiRoot || "the server";
  if (typeof body === "string") {
    const payloadErr = registrationPayloadTooLargeMessage(body);
    if (payloadErr) return payloadErr;
    if (body.length > 1_500_000) {
      return `${PHOTO_SIZE_TOO_LARGE} — upload failed (photo or connection). Use JPG/PNG up to ${MAX_STUDENT_PHOTO_MB} MB and check your network.`;
    }
  }
  return `Cannot reach the attendance service${
    /localhost|127\.0\.0\.1/.test(api) ? " on this computer. Restart the desktop app and try again." : ` at ${api}. Check your internet connection and try again.`
  }`;
}
