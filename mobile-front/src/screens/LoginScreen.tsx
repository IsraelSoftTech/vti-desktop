import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TextField from "../components/TextField";
import PrimaryButton from "../components/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import { accountDeletionUrl, privacyPolicyUrl } from "../api/config";
import { useColors, useTheme } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";
import ThemeToggle from "../components/ThemeToggle";
import MpasatWordmark from "../components/MpasatWordmark";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, monitor, signingIn } = useAuth();
  const [mode, setMode] = useState<"login" | "monitor">("login");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const isMonitor = mode === "monitor";

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  async function handleSubmit() {
    setError("");
    try {
      if (isMonitor) {
        await monitor(phone.trim());
      } else {
        await login(username.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isMonitor ? "Could not open parent access" : "Login failed");
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View style={styles.themeRow}>
        <ThemeToggle onDarkBar={false} />
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            keyboardOpen ? styles.scrollKeyboard : null,
            { paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <MpasatWordmark />
            <Text style={styles.formTitle}>{isMonitor ? "Monitor my child" : "Sign in"}</Text>
            <Text style={styles.cardSubtitle}>
              {isMonitor
                ? "Enter Phone Number as seen on student’s ID Card"
                : "Staff username or parent phone"}
            </Text>

            <View style={styles.form}>
              {isMonitor ? (
                <TextField
                  label="Phone number"
                  value={phone}
                  onChangeText={setPhone}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="phone-pad"
                  placeholder="6XX XX XX XX"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              ) : (
                <>
                  <TextField
                    label="Username or phone"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Staff username or parent phone"
                    returnKeyType="next"
                  />
                  <TextField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureToggle
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                </>
              )}

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <PrimaryButton
                title={
                  signingIn
                    ? isMonitor
                      ? "Opening…"
                      : "Signing in…"
                    : isMonitor
                      ? "Proceed"
                      : "Sign in"
                }
                loading={signingIn}
                onPress={handleSubmit}
              />

              <Pressable
                onPress={() => {
                  setError("");
                  setMode(isMonitor ? "login" : "monitor");
                }}
                style={styles.switchBtn}
              >
                <Text style={styles.switchText}>
                  {isMonitor ? "Staff sign in" : "I’m a parent — Monitor My Child"}
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            onPress={() => void Linking.openURL(privacyPolicyUrl())}
          >
            <Text style={styles.footer}>Privacy Policy</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Request account and data deletion"
            onPress={() => void Linking.openURL(accountDeletionUrl())}
          >
            <Text style={styles.footer}>Request data deletion</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    themeRow: {
      alignItems: "flex-end",
      paddingHorizontal: 16,
      paddingBottom: 4,
    },
    body: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      flexGrow: 1,
      justifyContent: "center",
    },
    scrollKeyboard: {
      justifyContent: "flex-start",
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      paddingHorizontal: 22,
      paddingVertical: 22,
    },
    formTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.primaryDark,
      letterSpacing: -0.3,
      textAlign: "center",
    },
    cardSubtitle: {
      marginTop: 6,
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 20,
      textAlign: "center",
    },
    form: {
      gap: 16,
    },
    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: "#ffcdd2",
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "500",
    },
    footer: {
      marginTop: 18,
      textAlign: "center",
      fontSize: 12,
      fontWeight: "700",
      color: colors.primary,
      textDecorationLine: "underline",
    },
    switchBtn: {
      alignItems: "center",
      paddingVertical: 4,
    },
    switchText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.primary,
      textAlign: "center",
    },
  });
}
