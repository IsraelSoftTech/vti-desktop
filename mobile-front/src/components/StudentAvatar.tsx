import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { getStoredToken } from "../api/client";
import { attendanceApiRoot } from "../api/config";
import { useColors } from "../theme/ThemeContext";

type Props = {
  studentId: number;
  photoUrl?: string | null;
  size?: number;
};

export default function StudentAvatar({ studentId, photoUrl, size = 56 }: Props) {
  const colors = useColors();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (photoUrl && (photoUrl.startsWith("http") || photoUrl.startsWith("data:"))) {
      setUri(photoUrl);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const token = await getStoredToken();
        const dest = `${FileSystem.cacheDirectory}parent_photo_${studentId}.jpg`;
        const { uri: local, status } = await FileSystem.downloadAsync(
          `${attendanceApiRoot()}/parent/students/${studentId}/photo`,
          dest,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (!cancelled && status >= 200 && status < 300) {
          setUri(local);
        }
      } catch {
        if (!cancelled) setUri(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, photoUrl]);

  const radius = Math.round(size * 0.22);

  if (!uri) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: radius, backgroundColor: colors.primarySoft },
        ]}
      >
        <Ionicons name="person" size={Math.round(size * 0.42)} color={colors.primary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.primarySoft }}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
});
