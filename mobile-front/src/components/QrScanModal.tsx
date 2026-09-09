import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { SCAN_TIMEOUT_MS, scanTimeoutSeconds } from "../utils/scanConstants";
import { colors } from "../theme/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  onTimeout: () => void;
};

export default function QrScanModal({ visible, onClose, onScanned, onTimeout }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [permReady, setPermReady] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [status, setStatus] = useState("Opening camera…");
  const [secondsLeft, setSecondsLeft] = useState(scanTimeoutSeconds());
  const [locked, setLocked] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockedRef = useRef(false);

  const finish = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startTimers = useCallback(() => {
    finish();
    setSecondsLeft(scanTimeoutSeconds());
    timeoutRef.current = setTimeout(() => {
      finish();
      onTimeout();
    }, SCAN_TIMEOUT_MS);
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
  }, [finish, onTimeout]);

  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (lockedRef.current) return;
      const code = result.data?.trim();
      if (!code) return;
      lockedRef.current = true;
      setLocked(true);
      finish();
      onScanned(code);
    },
    [finish, onScanned]
  );

  useEffect(() => {
    if (!visible) {
      lockedRef.current = false;
      finish();
      return;
    }

    lockedRef.current = false;
    setLocked(false);
    setPermReady(false);
    setPermDenied(false);
    setFacing("back");
    setStatus("Opening camera…");
    setSecondsLeft(scanTimeoutSeconds());

    (async () => {
      let granted = permission?.granted;
      if (!granted) {
        const result = await requestPermission();
        granted = result.granted;
      }
      if (!granted) {
        setPermDenied(true);
        setStatus("Camera permission denied. Close this screen and type the barcode instead.");
        return;
      }
      setPermReady(true);
      setStatus("Point at the student ID QR code");
      startTimers();
    })();

    return finish;
  }, [visible, permission?.granted, requestPermission, finish, startTimers]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.top}>
          <View>
            <Text style={styles.title}>Scan ID QR Code</Text>
            <Text style={styles.sub}>
              {facing === "back" ? "Back" : "Front"} camera · {secondsLeft}s remaining
            </Text>
          </View>
          <View style={styles.topActions}>
            {permReady ? (
              <Pressable
                onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                style={styles.close}
              >
                <Ionicons name="camera-reverse-outline" size={22} color={colors.white} />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
          </View>
        </View>

        <View style={styles.cameraWrap}>
          {permDenied ? (
            <View style={styles.loading}>
              <Ionicons name="lock-closed-outline" size={36} color={colors.white} />
              <Text style={styles.loadingText}>{status}</Text>
            </View>
          ) : permReady ? (
            <>
              <CameraView
                style={styles.camera}
                facing={facing}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={locked ? undefined : handleScan}
              />
              <View style={styles.overlay} pointerEvents="none">
                <View style={styles.qrFrame} />
              </View>
            </>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{status}</Text>
            </View>
          )}
        </View>

        <Text style={styles.hint}>{status}</Text>
        <Text style={styles.tip}>
          {permDenied
            ? "You can still record attendance or look up fees by typing the ID barcode."
            : "Hold the printed ID card steady inside the frame"}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  top: {
    paddingTop: 52,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  topActions: { flexDirection: "row", gap: 8 },
  title: { color: colors.white, fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraWrap: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  qrFrame: {
    width: "62%",
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: 16,
    backgroundColor: "rgba(45,91,255,0.06)",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: { color: colors.white, fontSize: 14, fontWeight: "600", textAlign: "center" },
  hint: {
    color: colors.white,
    textAlign: "center",
    padding: 14,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: "600",
  },
  tip: {
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    paddingHorizontal: 20,
    paddingBottom: 24,
    fontSize: 11,
    fontWeight: "600",
  },
});
