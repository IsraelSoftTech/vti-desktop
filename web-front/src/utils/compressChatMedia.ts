export const CHAT_MAX_IMAGE_BYTES = 400 * 1024;
export const CHAT_MAX_DOC_BYTES = 1200 * 1024;
export const CHAT_MAX_VOICE_MS = 45_000;

function blobFromCanvas(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not shrink this photo."));
      },
      "image/jpeg",
      quality
    );
  });
}

export async function compressChatFile(file: File): Promise<File> {
  const type = (file.type || "").toLowerCase();
  const name = file.name || "file";

  if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/i.test(name)) {
    const bitmap = await createImageBitmap(file);
    const max = 1280;
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > max || height > max) {
      const scale = max / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not shrink this photo.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let quality = 0.7;
    let blob = await blobFromCanvas(canvas, quality);
    while (blob.size > CHAT_MAX_IMAGE_BYTES && quality > 0.38) {
      quality -= 0.12;
      blob = await blobFromCanvas(canvas, quality);
    }
    if (blob.size > 700 * 1024) {
      throw new Error("This photo is still too heavy after shrinking. Pick a smaller image.");
    }
    return new File([blob], name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }

  if (type.startsWith("audio/")) {
    if (file.size > 1500 * 1024) {
      throw new Error("That voice note is too long. Keep it under 45 seconds.");
    }
    return file;
  }

  if (file.size > CHAT_MAX_DOC_BYTES) {
    throw new Error("That document is too heavy. Send a lighter PDF (about 1 MB or less).");
  }
  return file;
}
