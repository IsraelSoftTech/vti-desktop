import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import { linkParentStudents } from "../../api/parent";
import { useAuth } from "../../context/AuthContext";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";
import ThemeToggle from "../../components/ThemeToggle";

const MIN = 1;
const MAX = 10;

export default function ParentFirstRunScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshUser, logout } = useAuth();
  const [count, setCount] = useState(1);
  const [codes, setCodes] = useState<string[]>([""]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fields = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  function setCountSafe(next: number) {
    const n = Math.min(MAX, Math.max(MIN, next));
    setCount(n);
    setCodes((prev) => {
      const copy = prev.slice(0, n);
      while (copy.length < n) copy.push("");
      return copy;
    });
  }

  async function handleProceed() {
    setError("");
    const barcodes = codes.map((c) => c.trim());
    if (barcodes.some((c) => !c)) {
      setError("Enter a barcode for each student.");
      return;
    }
    const seen = new Set<string>();
    for (const code of barcodes) {
      const key = code.toUpperCase();
      if (seen.has(key)) {
        setError("Duplicate barcodes in the form.");
        return;
      }
      seen.add(key);
    }

    setSaving(true);
    try {
      await linkParentStudents(barcodes);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link students");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[colors.headerStart, colors.headerEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>First-time setup</Text>
            <Text style={styles.title}>Link your children</Text>
          </View>
          <View style={styles.headerActions}>
            <ThemeToggle />
            <Pressable onPress={() => logout()} style={styles.logoutChip}>
              <Text style={styles.logoutChipText}>Logout</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Type the barcode printed on each student’s ID card. You can add more later.
        </Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.question}>How many students do you want to monitor?</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setCountSafe(count - 1)}
                disabled={count <= MIN}
                style={[styles.stepBtn, count <= MIN && styles.stepBtnDisabled]}
              >
                <Ionicons name="remove" size={20} color={colors.primary} />
              </Pressable>
              <Text style={styles.stepValue}>{count}</Text>
              <Pressable
                onPress={() => setCountSafe(count + 1)}
                disabled={count >= MAX}
                style={[styles.stepBtn, count >= MAX && styles.stepBtnDisabled]}
              >
                <Ionicons name="add" size={20} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={styles.hint}>1–10 students. Default is 1.</Text>

            <View style={styles.fields}>
              {fields.map((i) => (
                <TextField
                  key={i}
                  label={count === 1 ? "Student barcode" : `Student ${i + 1} barcode`}
                  value={codes[i] || ""}
                  onChangeText={(v) =>
                    setCodes((prev) => {
                      const next = [...prev];
                      next[i] = v;
                      return next;
                    })
                  }
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="Number on the ID card"
                  returnKeyType={i === count - 1 ? "done" : "next"}
                />
              ))}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <PrimaryButton
              title={saving ? "Linking…" : "Proceed"}
              loading={saving}
              onPress={handleProceed}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.72)",
  },
  title: {
    marginTop: 4,
    fontSize: 26,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.9)",
  },
  logoutChip: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutChipText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 12,
  },
  body: { flex: 1, marginTop: -18 },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 5,
    gap: 14,
  },
  question: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 6,
    gap: 8,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepValue: {
    minWidth: 36,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
  },
  hint: { fontSize: 12, color: colors.textMuted },
  fields: { gap: 12, marginTop: 4 },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "500" },
  });
}
