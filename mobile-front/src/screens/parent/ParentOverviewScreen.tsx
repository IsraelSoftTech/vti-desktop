import { useCallback, useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import ParentScreenLayout from "../../components/ParentScreenLayout";
import { getParentOverview, type ParentOverview, type ParentOverviewTrend } from "../../api/parent";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { useAuth } from "../../context/AuthContext";
import { formatMoney } from "../../utils/currency";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";

function TrendChart({
  trend,
  emptyText,
}: {
  trend: ParentOverviewTrend[];
  emptyText: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const bars = trend.length ? trend : [];
  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHead}>
        <Text style={styles.cardKicker}>Last 7 school days</Text>
        <Text style={styles.cardTitle}>Daily attendance</Text>
      </View>
      {bars.length === 0 ? (
        <Text style={styles.chartEmpty}>{emptyText}</Text>
      ) : (
        <View style={styles.chartRow}>
          {bars.map((day) => {
            const h = Math.max(8, Math.round((day.rate / 100) * 112));
            return (
              <View key={day.date} style={styles.chartCol}>
                <Text style={styles.chartPct}>{day.rate}%</Text>
                <View style={styles.chartTrack}>
                  <LinearGradient
                    colors={day.rate >= 80 ? ["#34D399", colors.success] : [colors.secondary, colors.primary]}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 0, y: 0 }}
                    style={[styles.chartBar, { height: h }]}
                  />
                </View>
                <Text style={styles.chartLabel}>{day.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function ParentOverviewScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const loader = useCallback(() => getParentOverview(), []);
  const { data, loading, refreshing, error, reload, softLoad } = useCachedQuery<ParentOverview>(
    loader,
    {
      cacheKey: "parent-overview",
      maxAgeMs: 20_000,
    }
  );

  useFocusEffect(
    useCallback(() => {
      softLoad();
    }, [softLoad])
  );

  const overview = data;
  const fees = overview?.fees;

  return (
    <ParentScreenLayout>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />
        }
      >
        <View style={styles.hello}>
          <Text style={styles.helloKicker}>Overview</Text>
          <Text style={styles.helloTitle}>{user?.fullName || "Parent"}</Text>
        </View>

        {error && !data ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading && !data ? (
          <View style={styles.skeleton} />
        ) : (
          <>
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="people" size={18} color={colors.primary} />
                </View>
                <Text style={styles.statValue}>{overview?.monitoredCount ?? 0}</Text>
                <Text style={styles.statLabel}>Monitored</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: colors.successSoft }]}>
                  <Ionicons name="checkmark-done" size={18} color={colors.success} />
                </View>
                <Text style={styles.statValue}>{overview?.attendanceRate ?? 0}%</Text>
                <Text style={styles.statLabel}>Recent rate</Text>
              </View>
            </View>
            <Text style={styles.caption}>
              {overview?.presentCount ?? 0} check-ins of {overview?.expectedCount ?? 0} expected over
              the last 7 school days
            </Text>

            <Pressable
              onPress={() => navigation.navigate("Fees" as never)}
              style={({ pressed }) => [styles.feeCard, pressed && styles.pressed]}
            >
              <View style={styles.feeTop}>
                <View>
                  <Text style={styles.cardKicker}>Fees</Text>
                  <Text style={styles.cardTitle}>Overall balance</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <View style={styles.feeRow}>
                <View style={styles.feeBox}>
                  <Text style={styles.feeVal}>{formatMoney(fees?.totalExpected ?? 0)}</Text>
                  <Text style={styles.feeLbl}>Expected</Text>
                </View>
                <View style={styles.feeBox}>
                  <Text style={[styles.feeVal, { color: colors.success }]}>
                    {formatMoney(fees?.totalPaid ?? 0)}
                  </Text>
                  <Text style={styles.feeLbl}>Paid</Text>
                </View>
                <View style={styles.feeBox}>
                  <Text
                    style={[
                      styles.feeVal,
                      { color: (fees?.totalBalance ?? 0) > 0 ? colors.danger : colors.success },
                    ]}
                  >
                    {formatMoney(fees?.totalBalance ?? 0)}
                  </Text>
                  <Text style={styles.feeLbl}>Balance</Text>
                </View>
              </View>
              {(fees?.discountAmount ?? 0) > 0 ? (
                <Text style={styles.discountNote}>
                  Discount applied {formatMoney(fees?.discountAmount ?? 0)}
                </Text>
              ) : null}
              {(fees?.owingCount ?? 0) > 0 ? (
                <Text style={styles.owingNote}>
                  {fees?.owingCount} student{(fees?.owingCount || 0) === 1 ? "" : "s"} still owing
                </Text>
              ) : overview?.monitoredCount ? (
                <Text style={styles.clearNote}>No outstanding balance</Text>
              ) : (
                <Text style={styles.clearNote}>Link a student to see fee records</Text>
              )}
            </Pressable>

            <TrendChart
              trend={overview?.trend || []}
              emptyText={
                overview?.monitoredCount
                  ? "No school days in this window yet."
                  : "Link a student to see attendance."
              }
            />
          </>
        )}
      </ScrollView>
    </ParentScreenLayout>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, gap: 14 },
  hello: { paddingTop: 4, paddingBottom: 2 },
  helloKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.secondary,
  },
  helloTitle: { marginTop: 4, fontSize: 24, fontWeight: "800", color: colors.primary },
  statRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: { fontSize: 26, fontWeight: "800", color: colors.primary },
  statLabel: { marginTop: 2, fontSize: 12, fontWeight: "600", color: colors.textMuted },
  caption: { marginTop: -6, fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  feeCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  pressed: { opacity: 0.92 },
  feeTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.secondary,
  },
  cardTitle: { marginTop: 2, fontSize: 16, fontWeight: "800", color: colors.primary },
  feeRow: { flexDirection: "row", gap: 8 },
  feeBox: { flex: 1 },
  feeVal: { fontSize: 15, fontWeight: "800", color: colors.text },
  feeLbl: { marginTop: 2, fontSize: 11, fontWeight: "600", color: colors.textMuted },
  owingNote: { fontSize: 12, fontWeight: "600", color: colors.danger },
  discountNote: { fontSize: 12, fontWeight: "600", color: colors.secondary },
  clearNote: { fontSize: 12, fontWeight: "600", color: colors.success },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartHead: { marginBottom: 12 },
  chartEmpty: { fontSize: 13, color: colors.textMuted, paddingVertical: 24, textAlign: "center" },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 168 },
  chartCol: { flex: 1, alignItems: "center", gap: 6 },
  chartPct: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
  chartTrack: {
    height: 112,
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    overflow: "hidden",
  },
  chartBar: { width: "100%", borderRadius: 10 },
  chartLabel: { fontSize: 11, fontWeight: "700", color: colors.textSub },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 14, padding: 12 },
  errorText: { color: colors.danger, fontWeight: "600" },
  skeleton: { height: 220, borderRadius: 20, backgroundColor: colors.primarySoft },
  });
}
