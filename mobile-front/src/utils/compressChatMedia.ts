import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

export const CHAT_MAX_IMAGE_BYTES = 400 * 1024;
export const CHAT_MAX_AUDIO_BYTES = 1500 * 1024;
export const CHAT_MAX_DOC_BYTES = 1200 * 1024;
export const CHAT_MAX_VOICE_MS = 45_000;

export type ChatPick = {
  uri: string;
  name: string;
  mime: string;
  kind: "image" | "audio" | "document";
};

function guessMime(name: string, fallback: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".m4a") || n.endsWith(".aac")) return "audio/m4a";
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".webm")) return "audio/webm";
  if (n.endsWith(".wav")) return "audio/wav";
  return fallback;
}

async function fileSize(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && "size" in info && typeof info.size === "number") return info.size;
  return 0;
}

async function shrinkImage(uri: string) {
  try {
    const { manipulateAsync, SaveFormat } = await import("expo-image-manipulator");
    let result = await manipulateAsync(uri, [{ resize: { width: 1280 } }], {
      compress: 0.65,
      format: SaveFormat.JPEG,
    });
    let size = await fileSize(result.uri);
    if (size > CHAT_MAX_IMAGE_BYTES) {
      result = await manipulateAsync(result.uri, [], {
        compress: 0.45,
        format: SaveFormat.JPEG,
      });
      size = await fileSize(result.uri);
    }
    if (size > CHAT_MAX_IMAGE_BYTES) {
      result = await manipulateAsync(result.uri, [{ resize: { width: 960 } }], {
        compress: 0.4,
        format: SaveFormat.JPEG,
      });
    }
    return result.uri;
  } catch {
    return uri;
  }
}

async function asImagePick(uri: string, name: string, mime?: string | null): Promise<ChatPick> {
  const shrunk = await shrinkImage(uri);
  const size = await fileSize(shrunk);
  if (size > 700 * 1024) {
    throw new Error("This photo is still too heavy after shrinking. Pick a smaller image.");
  }
  return {
    uri: shrunk,
    name: name.replace(/\.\w+$/, "") + ".jpg",
    mime: mime?.startsWith("image/") && !mime.includes("png") ? "image/jpeg" : "image/jpeg",
    kind: "image",
  };
}

export async function pickChatImage(from: "library" | "camera"): Promise<ChatPick | null> {
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.7,
    exif: false,
  };
  const res =
    from === "camera"
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]?.uri) return null;
  const asset = res.assets[0];
  return asImagePick(asset.uri, asset.fileName || "photo.jpg", asset.mimeType);
}

export async function pickChatDocument(): Promise<ChatPick | null> {
  const res = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: [
      "image/*",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
  });
  if (res.canceled || !res.assets[0]?.uri) return null;
  const asset = res.assets[0];
  const mime = asset.mimeType || guessMime(asset.name || "", "application/octet-stream");
  if (mime.startsWith("image/")) {
    return asImagePick(asset.uri, asset.name || "photo.jpg", mime);
  }
  const size = asset.size || (await fileSize(asset.uri));
  if (size > CHAT_MAX_DOC_BYTES) {
    throw new Error("That document is too heavy. Send a lighter PDF (about 1 MB or less).");
  }
  return {
    uri: asset.uri,
    name: asset.name || "document",
    mime,
    kind: "document",
  };
}

export async function voicePickFromUri(uri: string): Promise<ChatPick> {
  const size = await fileSize(uri);
  if (size > CHAT_MAX_AUDIO_BYTES) {
    throw new Error("That voice note is too long. Keep it under 45 seconds.");
  }
  return {
    uri,
    name: "voice.m4a",
    mime: guessMime(uri, "audio/m4a"),
    kind: "audio",
  };
}
