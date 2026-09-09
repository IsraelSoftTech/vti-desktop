import { memo, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isAccountant, isParent } from "../api/auth";
import { accountDeletionUrl, privacyPolicyUrl } from "../api/config";
import { useAuth } from "../context/AuthContext";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";
import ThemeToggle from "./ThemeToggle";
import ChangePasswordForm, { ChangePasswordToggle } from "./ChangePasswordForm";

type Props = {
  notificationCount?: number;
  onNotificationsPress?: () => void;
};

function AppTopBar({
  notificationCount = 0,
  onNotificationsPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, logout } = useAuth();
  const parent = isParent(user);
  const roleLabel = parent
    ? "Parent"
    : isAccountant(user)
      ? "Accountant"
      : "Administrator";
  const brandTag = parent ? "Parent portal" : "Attendance System";
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) return;
    setPasswordOpen(false);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <>
      <LinearGradient
        colors={[colors.headerStart, colors.headerEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.wrap, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.row}>
          <View style={styles.brand}>
            <View style={styles.logoSlot}>
              <Ionicons name="shield-checkmark" size={22} color={colors.headerStart} />
            </View>
            <View>
              <Text style={styles.brandName}>MPASAT</Text>
              <Text style={styles.brandTag}>{brandTag}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <ThemeToggle />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={onNotificationsPress}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.white} />
              {notificationCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profile menu"
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Ionicons name="person-circle-outline" size={24} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <KeyboardAvoidingView
          style={styles.menuAvoid}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
            <Pressable
              style={[
                styles.menuCard,
                passwordOpen && styles.menuCardForm,
                { marginTop: insets.top + 58 },
              ]}
              onPress={() => {}}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <Text style={styles.menuName}>{user?.fullName || user?.username}</Text>
                <Text style={styles.menuUser}>
                  @{user?.username} · {roleLabel}
                </Text>
                {parent ? null : (
                  <>
                    <ChangePasswordToggle
                      open={passwordOpen}
                      onPress={() => setPasswordOpen((v) => !v)}
                      label={isAccountant(user) ? "Change credentials" : "Change password"}
                    />
                    <ChangePasswordForm
                      visible={passwordOpen}
                      onClosed={() => {
                        setPasswordOpen(false);
                        setMenuOpen(false);
                      }}
                    />
                  </>
                )}
                <Pressable
                  style={styles.legalBtn}
                  onPress={() => void Linking.openURL(privacyPolicyUrl())}
                >
                  <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                  <Text style={styles.legalText}>Privacy Policy</Text>
                </Pressable>
                <Pressable
                  style={styles.legalBtn}
                  onPress={() => void Linking.openURL(accountDeletionUrl())}
                >
                  <Ionicons name="trash-bin-outline" size={18} color={colors.primary} />
                  <Text style={styles.legalText}>Request data deletion</Text>
                </Pressable>
                <Pressable style={styles.logoutBtn} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                  <Text style={styles.logoutText}>Logout</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

export default memo(AppTopBar);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 14,
      paddingBottom: 18,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: colors.headerStart,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 16,
      elevation: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    brand: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    logoSlot: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: colors.white,
      alignItems: "center",
      justifyContent: "center",
    },
    brandName: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.white,
      letterSpacing: 0.6,
    },
    brandTag: {
      marginTop: 2,
      fontSize: 11,
      color: "rgba(255,255,255,0.78)",
      fontWeight: "500",
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.12)",
      position: "relative",
    },
    iconBtnPressed: {
      backgroundColor: "rgba(255,255,255,0.22)",
    },
    badge: {
      position: "absolute",
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.accentPeach,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: colors.headerEnd,
    },
    badgeText: {
      fontSize: 9,
      fontWeight: "800",
      color: colors.white,
    },
    menuAvoid: {
      flex: 1,
    },
    menuBackdrop: {
      flex: 1,
      backgroundColor: "rgba(13, 26, 62, 0.28)",
      alignItems: "flex-end",
      paddingHorizontal: 16,
    },
    menuCard: {
      width: 280,
      maxWidth: "100%",
      maxHeight: "82%",
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 1,
      shadowRadius: 20,
      elevation: 8,
    },
    menuCardForm: {
      width: 320,
    },
    menuName: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.text,
    },
    menuUser: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 14,
    },
    legalBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.primarySoft,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    legalText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
    },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.dangerSoft,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    logoutText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.danger,
    },
  });
}
