import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

function safeName(name: string, fallback: string) {
  const cleaned = String(name || fallback)
    .replace(/[^\w.\-()+ ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return cleaned || fallback;
}

async function copyNamed(uri: string, filename: string) {
  const dest = `${FileSystem.documentDirectory}${filename}`;
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function saveChatFile(opts: {
  uri: string;
  name: string;
  mime?: string | null;
}): Promise<{ message: string }> {
  const mime = String(opts.mime || "application/octet-stream");
  const isImage = mime.startsWith("image/");
  const filename = safeName(opts.name, isImage ? "photo.jpg" : "document.bin");
  const local = await copyNamed(opts.uri, filename);

  if (isImage) {
    try {
      const MediaLibrary = await import("expo-media-library");
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.granted) {
        await MediaLibrary.saveToLibraryAsync(local);
        return { message: "Photo saved to your gallery." };
      }
    } catch {
      /* share instead */
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(local, {
      mimeType: mime,
      dialogTitle: isImage ? "Save photo" : "Save document",
      UTI: isImage ? "public.image" : mime.includes("pdf") ? "com.adobe.pdf" : undefined,
    });
    return { message: "" };
  }

  return { message: "File kept in the app. Use Share if you need another copy." };
}
