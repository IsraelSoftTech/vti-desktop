import { useCallback } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ScreenLayout from "../../components/ScreenLayout";
import StatCard from "../../components/StatCard";
import { getFeeDashboard, type FeeDashboardData } from "../../api/fees";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { formatMoney } from "../../utils/currency";
import { colors } from "../../theme/colors";

function StatSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonIcon} />
      <View style={styles.skeletonLineLg} />
      <View style={styles.skeletonLineSm} />
    </View>
  );
}

export default function AccountantHomeScreen() {
  const loader = useCallback(() => getFeeDashboard(), []);
  const { data, loading, refreshing, error, reload, softLoad } = useCachedQuery<FeeDashboardData>(
    loader,
    { cacheKey: "fee-dashboard", maxAgeMs: 60_000 }
  );

  useFocusEffect(
    useCallback(() => {
      softLoad();
    }, [softLoad])
  );

  const stats = data?.stats;
  const showSkeleton = loading && !data;

  return (
    <ScreenLayout>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />
        }
      >
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>Home</Text>
          {data?.activeYear ? (
            <View style={styles.yearPill}>
              <Text style={styles.yearPillText}>{data.activeYear.name}</Text>
            </View>
          ) : (
            <Text style={styles.warnText}>No active academic year set</Text>
          )}
        </View>

        {error && !data ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : showSkeleton ? (
          <View style={styles.statsGrid}>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatCard
              label="Total Students"
              value={String(stats?.totalStudents ?? 0)}
              icon="people-outline"
              accent={colors.primary}
              accentSoft={colors.primarySoft}
            />
            <StatCard
              label="Total Fee Expected"
              value={formatMoney(stats?.totalFeeExpected ?? 0)}
              icon="wallet-outline"
              accent={colors.accentPurple}
              accentSoft="#f0edff"
            />
            <StatCard
              label="Total Fee Paid"
              value={formatMoney(stats?.totalFeePaid ?? 0)}
              icon="checkmark-circle-outline"
              accent={colors.accentTeal}
              accentSoft={colors.accentTealSoft}
            />
            <StatCard
              label="Total Fee Owed"
              value={formatMoney(stats?.totalFeeOwed ?? 0)}
              icon="alert-circle-outline"
              accent={colors.danger}
              accentSoft={colors.dangerSoft}
            />
          </View>
        )}

        {loading && data ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.inlineLoad} />
        ) : null}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 18,
  },
  welcomeCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 4,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primaryDark,
    marginBottom: 6,
  },
  yearPill: {
    alignSelf: "flex-start",
    marginTop: 12,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  yearPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  warnText: {
    marginTop: 12,
    fontSize: 12,
    color: colors.accentPeach,
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    padding: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  inlineLoad: {
    alignSelf: "center",
  },
  skeletonCard: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 16,
    gap: 10,
  },
  skeletonIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
  },
  skeletonLineLg: {
    width: "55%",
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  skeletonLineSm: {
    width: "70%",
    height: 14,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
});
