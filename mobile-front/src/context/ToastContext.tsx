import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useColors } from "../theme/ThemeContext";

type ToastKind = "ok" | "err";

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const opacity = useMemo(() => new Animated.Value(0), []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "ok") => {
      setToast({ message, kind });
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => setToast(null));
    },
    [opacity]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <Animated.View
          style={[
            styles.toast,
            { backgroundColor: toast.kind === "ok" ? colors.accentTeal : colors.danger, opacity },
          ]}
        >
          <Text style={[styles.toastText, { color: colors.white }]}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    bottom: 96,
    left: 20,
    right: 20,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 999,
    elevation: 12,
  },
  toastText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
