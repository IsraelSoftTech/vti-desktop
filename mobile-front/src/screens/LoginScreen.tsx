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
  const { login, register, signingIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const isRegister = mode === "register";

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
      if (isRegister) {
        if (password !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        await register(fullName.trim(), phone.trim(), password);
      } else {
        await login(username.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isRegister ? "Registration failed" : "Login failed");
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
            <Text style={styles.formTitle}>{isRegister ? "Register" : "Sign in"}</Text>
            <Text style={styles.cardSubtitle}>
              {isRegister
                ? "Phone number is your login. Staff should sign in instead."
                : "Staff username or parent phone"}
            </Text>

            <View style={styles.form}>
              {isRegister ? (
                <>
                  <TextField
                    label="Full name"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    placeholder="Your full name"
                    returnKeyType="next"
                  />
                  <TextField
                    label="Cameroon phone"
                    value={phone}
                    onChangeText={setPhone}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="phone-pad"
                    placeholder="6XX XX XX XX"
                    returnKeyType="next"
                  />
                </>
              ) : (
                <TextField
                  label="Username or phone"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Staff username or parent phone"
                  returnKeyType="next"
                />
              )}
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder={isRegister ? "At least 6 characters" : "Enter your password"}
                secureToggle
                returnKeyType={isRegister ? "next" : "done"}
                onSubmitEditing={isRegister ? undefined : handleSubmit}
              />
              {isRegister ? (
                <TextField
                  label="Confirm password"
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Re-enter password"
                  secureToggle
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              ) : null}

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <PrimaryButton
                title={
                  signingIn
                    ? isRegister
                      ? "Creating account…"
                      : "Signing in…"
                    : isRegister
                      ? "Create parent account"
                      : "Sign in"
                }
                loading={signingIn}
                onPress={handleSubmit}
              />

              <Pressable
                onPress={() => {
                  setError("");
                  setMode(isRegister ? "login" : "register");
                }}
                style={styles.switchBtn}
              >
                <Text style={styles.switchText}>
                  {isRegister
                    ? "Already have an account? Sign in"
                    : "I’m a parent — create an account"}
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
