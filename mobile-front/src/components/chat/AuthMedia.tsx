import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { getStoredToken } from "../../api/client";
import { attendanceApiRoot } from "../../api/config";
import { saveChatFile } from "../../utils/saveChatFile";

export function useAuthedFile(path: string, cacheKey: string, ext = "bin") {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUri(null);
      setLoading(false);
      setError(false);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const token = await getStoredToken();
        const dest = `${FileSystem.cacheDirectory}chat_${cacheKey}.${ext}`;
        const { uri: local, status } = await FileSystem.downloadAsync(
          `${attendanceApiRoot()}${path.startsWith("/") ? path : `/${path}`}`,
          dest,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!cancelled && status >= 200 && status < 300) setUri(local);
        else if (!cancelled) setError(true);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, cacheKey, ext]);

  return { uri, loading, error };
}

export async function saveAttachment(uri: string, name: string, mime?: string | null) {
  try {
    const result = await saveChatFile({ uri, name, mime });
    if (result.message) Alert.alert("Saved", result.message);
  } catch (err) {
    Alert.alert("Could not save", err instanceof Error ? err.message : "Try again.");
  }
}

export function SaveFileButton({
  uri,
  name,
  mime,
  light,
}: {
  uri: string | null;
  name: string;
  mime?: string | null;
  light?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (!uri) return null;
  return (
    <Pressable
      style={[styles.saveBtn, light ? styles.saveBtnLight : styles.saveBtnDark]}
      disabled={busy}
      onPress={() => {
        setBusy(true);
        void saveAttachment(uri, name, mime).finally(() => setBusy(false));
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Save file"
    >
      {busy ? (
        <ActivityIndicator size="small" color={light ? "#fff" : "#1E3A8A"} />
      ) : (
        <>
          <Ionicons name="download-outline" size={14} color={light ? "#fff" : "#1E3A8A"} />
          <Text style={[styles.saveText, { color: light ? "#fff" : "#1E3A8A" }]}>Save</Text>
        </>
      )}
    </Pressable>
  );
}

export function ChatImage({
  path,
  cacheKey,
  height = 180,
  name = "photo.jpg",
  mime = "image/jpeg",
  light,
  onPress,
}: {
  path: string;
  cacheKey: string;
  height?: number;
  name?: string;
  mime?: string | null;
  light?: boolean;
  onPress?: (uri: string) => void;
}) {
  const { uri, loading } = useAuthedFile(path, cacheKey, "jpg");
  if (loading || !uri) {
    return (
      <View style={[styles.ph, { height }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  return (
    <View>
      <Pressable onPress={() => onPress?.(uri)}>
        <Image source={{ uri }} style={[styles.img, { height }]} resizeMode="cover" />
      </Pressable>
      <SaveFileButton uri={uri} name={name} mime={mime || "image/jpeg"} light={light} />
    </View>
  );
}

const styles = StyleSheet.create({
  ph: {
    width: 220,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  img: {
    width: 220,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  saveBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  saveBtnLight: { backgroundColor: "rgba(255,255,255,0.18)" },
  saveBtnDark: { backgroundColor: "rgba(30,58,138,0.1)" },
  saveText: { fontSize: 12, fontWeight: "800" },
});
