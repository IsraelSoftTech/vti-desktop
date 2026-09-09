import { useEffect } from "react";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ToastProvider } from "./src/context/ToastContext";
import { ThemeProvider, useColors } from "./src/theme/ThemeContext";
import { isParent } from "./src/api/auth";
import ErrorBoundary from "./src/components/ErrorBoundary";
import LoginScreen from "./src/screens/LoginScreen";
import {
  hasRegisteredParentPushToken,
  registerParentPushToken,
  requestParentAlertPermission,
  setupParentAlerts,
} from "./src/notifications/parentPush";

function ParentPushBootstrap() {
  const { user, loading } = useAuth();

  useEffect(() => {
    void setupParentAlerts();
    void requestParentAlertPermission();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!isParent(user)) return;
    let cancelled = false;

    const tryRegister = async () => {
      for (let attempt = 1; attempt <= 8 && !cancelled; attempt += 1) {
        const token = await registerParentPushToken();
        if (token || cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    };

    void tryRegister();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !cancelled && !hasRegisteredParentPushToken()) {
        void tryRegister();
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [loading, user]);

  return null;
}

function RootNavigator() {
  const { user, loading } = useAuth();
  const colors = useColors();

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <LoginScreen />;

  if (isParent(user) && !user.firstRunCompleted) {
    const ParentFirstRunScreen = require("./src/screens/parent/ParentFirstRunScreen").default;
    return <ParentFirstRunScreen />;
  }
  if (isParent(user)) {
    const ParentShell = require("./src/navigation/ParentShell").default;
    return <ParentShell />;
  }
  const MainTabs = require("./src/navigation/MainTabs").default;
  return <MainTabs />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <ParentPushBootstrap />
                <RootNavigator />
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
