import { useCallback, useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StudentAvatar from "../../components/StudentAvatar";
import { getParentStudentDay, type LinkedStudent, type StudentDayPayload } from "../../api/parent";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { useParentInbox } from "../../navigation/ParentInboxContext";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";

const MISSING = "--:--";

type Props = {
  student: LinkedStudent;
  onBack: () => void;
};

function noticeAccent(kind: string, colors: AppColors) {
  if (kind === "pair_summary") return { bg: colors.successSoft, fg: colors.success };
  if (kind === "missed_checkout") return { bg: colors.reservedBg, fg: colors.reserved };
  return { bg: colors.dangerSoft, fg: colors.danger };
}

export default function ParentStudentDayScreen({
  student,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { unread, openInbox } = useParentInbox();
  const loader = useCallback(() => getParentStudentDay(student.id), [student.id]);
  const { data, loading, refreshing, error, reload } = useCachedQuery<StudentDayPayload>(
    loader,
    { cacheKey: `parent-day-${student.id}`, maxAgeMs: 20_000 }
  );

  const day = data?.today;
  const notices = data?.notices || [];
  const profile = data?.student || student;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Today’s attendance
        </Text>
        <Pressable
          onPress={openInbox}
          style={styles.backBtn}
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={20} color={colors.white} />
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />
        }
      >
        <View style={styles.profileCard}>
          <StudentAvatar studentId={profile.id} photoUrl={profile.photoUrl} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile.fullName}</Text>
            <Text style={styles.meta}>{profile.className || "No class"}</Text>
            <Text style={styles.barcode}>{profile.barcode}</Text>
          </View>
        </View>

        {error && !data ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.timesCard}>
          <Text style={styles.sectionTitle}>
            Today {day?.dateLabel ? `(${day.dateLabel})` : ""}
          </Text>
          <View style={styles.timesRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Check-in</Text>
              <Text style={styles.timeValue}>{day?.checkIn || MISSING}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Check-out</Text>
              <Text style={styles.timeValue}>{day?.checkOut || MISSING}</Text>
            </View>
          </View>
          <Text style={styles.tzHint}>12-hour, Cameroon time</Text>
        </View>

        <Text style={styles.sectionTitle}>Recent notices</Text>
        {loading && !data ? (
          <View style={styles.skeleton} />
        ) : notices.length === 0 ? (
          <View style={styles.emptyNotice}>
            <Text style={styles.emptyNoticeText}>No miss or pair-summary notices yet.</Text>
          </View>
        ) : (
          notices.map((n, i) => {
            const accent = noticeAccent(n.kind, colors);
            return (
              <View key={`${n.kind}-${n.date}-${i}`} style={styles.notice}>
                <View style={[styles.noticeDot, { backgroundColor: accent.fg }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.noticeKind, { color: accent.fg }]}>{n.kindLabel}</Text>
                  <Text style={styles.noticeBody}>{n.body}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    top: {
      backgroundColor: colors.headerStart,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.primaryDark,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.white,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
  },
  scroll: { padding: 16, gap: 12 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 18, fontWeight: "800", color: colors.primary },
  meta: { marginTop: 2, fontSize: 13, color: colors.textSub },
  barcode: { marginTop: 4, fontSize: 12, fontWeight: "700", color: colors.reserved },
  timesCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 10,
  },
  timesRow: { flexDirection: "row", alignItems: "stretch" },
  timeBlock: { flex: 1, alignItems: "center", paddingVertical: 8 },
  timeDivider: { width: 1, backgroundColor: colors.border },
  timeLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  timeValue: {
    marginTop: 4,
    fontSize: 26,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  tzHint: { marginTop: 8, textAlign: "center", fontSize: 11, color: colors.textMuted },
  notice: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  noticeKind: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  noticeBody: { marginTop: 4, fontSize: 13, color: colors.text, lineHeight: 18 },
  emptyNotice: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyNoticeText: { color: colors.textMuted, fontSize: 13 },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
  },
  errorText: { color: colors.danger, fontWeight: "600" },
  skeleton: { height: 64, borderRadius: 16, backgroundColor: colors.primarySoft },
  });
}
