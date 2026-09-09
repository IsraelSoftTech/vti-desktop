import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DataTable from "../../components/DataTable";
import DatePickerField from "../../components/DatePickerField";
import StatCard from "../../components/StatCard";
import IconButton from "../../components/IconButton";
import ConfirmModal from "../../components/ConfirmModal";
import {
  clearRecords,
  deleteRecord,
  getRecords,
  type AttendanceRecord,
} from "../../api/attendance";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { formatDateDisplay, formatTimeDisplay, todayISO } from "../../utils/dateTime";
import { clearCache } from "../../utils/cache";
import { colors } from "../../theme/colors";

type Props = {
  refreshKey?: number;
  onChanged?: () => void;
};

export default function RecordsTab({ refreshKey, onChanged }: Props) {
  const { showToast } = useToast();
  const [filterDate, setFilterDate] = useState(todayISO());
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOne, setConfirmOne] = useState<AttendanceRecord | null>(null);
  const [confirmClearDay, setConfirmClearDay] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const loader = useCallback(() => getRecords({ date: filterDate }), [filterDate]);
  const { data: records, reload } = useCachedQuery<AttendanceRecord[]>(loader, {
    cacheKey: `attendance-records-${filterDate}-v${refreshKey ?? 0}`,
    maxAgeMs: 15_000,
  });

  const stats = useMemo(() => {
    const list = records || [];
    const checkIns = list.filter((r) => r.checkType === "check_in").length;
    const checkOuts = list.filter((r) => r.checkType === "check_out").length;
    const uniqueStudents = new Set(list.map((r) => r.studentId)).size;
    const qrScans = list.filter((r) => r.method === "barcode").length;
    return { checkIns, checkOuts, uniqueStudents, qrScans, total: list.length };
  }, [records]);

  function invalidate() {
    clearCache("dashboard");
    onChanged?.();
    void reload();
  }

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  async function handleDeleteOne() {
    if (!confirmOne) return;
    setBusy(true);
    try {
      await deleteRecord(confirmOne.id);
      setConfirmOne(null);
      showToast(`Removed ${confirmOne.studentName}'s record.`);
      invalidate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete record", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearDay() {
    setBusy(true);
    try {
      const res = await clearRecords({ date: filterDate });
      setConfirmClearDay(false);
      showToast(`Cleared ${res.deleted} record(s) for ${formatDateDisplay(filterDate)}.`);
      invalidate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not clear records", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAll() {
    setBusy(true);
    try {
      const res = await clearRecords();
      setConfirmClearAll(false);
      showToast(`Cleared ${res.deleted} attendance record(s) for this year.`);
      invalidate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not clear records", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.filterCard}>
        <View style={styles.filterHead}>
          <Text style={styles.filterTitle}>Records & analysis</Text>
          {(records?.length ?? 0) > 0 ? (
            <View style={styles.clearActions}>
              <Pressable
                style={({ pressed }) => [styles.clearBtn, styles.clearDayBtn, pressed && styles.pressed]}
                onPress={() => setConfirmClearDay(true)}
                disabled={busy}
              >
                <Ionicons name="brush-outline" size={16} color={colors.primary} />
                <Text style={styles.clearDayText}>Clear day</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.clearBtn, styles.clearAllBtn, pressed && styles.pressed]}
                onPress={() => setConfirmClearAll(true)}
                disabled={busy}
              >
                <Ionicons name="flame-outline" size={16} color={colors.danger} />
                <Text style={styles.clearAllText}>Clear all</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <DatePickerField label="Filter by date" value={filterDate} onChange={setFilterDate} />
        <Text style={styles.filterHint}>
          Showing attendance for {formatDateDisplay(filterDate)}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Check-ins"
          value={String(stats.checkIns)}
          icon="log-in-outline"
          accent={colors.primary}
          accentSoft={colors.primarySoft}
        />
        <StatCard
          label="Check-outs"
          value={String(stats.checkOuts)}
          icon="log-out-outline"
          accent={colors.accentPurple}
          accentSoft="#f0edff"
        />
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Students"
          value={String(stats.uniqueStudents)}
          icon="people-outline"
          accent={colors.accentTeal}
          accentSoft={colors.accentTealSoft}
        />
        <StatCard
          label="Total scans"
          value={String(stats.total)}
          icon="scan-outline"
          accent={colors.accentPeach}
          accentSoft={colors.accentPeachSoft}
        />
      </View>

      <View style={styles.analysisCard}>
        <Text style={styles.analysisTitle}>Scan breakdown</Text>
        <View style={styles.analysisRow}>
          <View style={styles.analysisItem}>
            <Text style={styles.analysisValue}>{stats.qrScans}</Text>
            <Text style={styles.analysisLabel}>ID QR scans</Text>
          </View>
          <View style={styles.analysisDivider} />
          <View style={styles.analysisItem}>
            <Text style={styles.analysisValue}>
              {stats.checkIns > 0
                ? `${Math.round((stats.checkOuts / stats.checkIns) * 100)}%`
                : "—"}
            </Text>
            <Text style={styles.analysisLabel}>Checkout rate</Text>
          </View>
        </View>
      </View>

      <Text style={styles.tableTitle}>Attendance log</Text>
      <DataTable
        data={records || []}
        keyExtractor={(r) => r.id}
        emptyText="No attendance records for this date."
        columns={[
          {
            key: "student",
            title: "Student",
            flex: 1.2,
            render: (r) => (
              <View>
                <Text style={styles.cellStrong}>{r.studentName}</Text>
                <Text style={styles.cellMuted}>{r.className || "—"}</Text>
              </View>
            ),
          },
          {
            key: "type",
            title: "Type",
            width: 84,
            render: (r) => (
              <View
                style={[
                  styles.badge,
                  r.checkType === "check_in" ? styles.badgeIn : styles.badgeOut,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    r.checkType === "check_in" ? styles.badgeTextIn : styles.badgeTextOut,
                  ]}
                >
                  {r.checkType === "check_in" ? "In" : "Out"}
                </Text>
              </View>
            ),
          },
          {
            key: "method",
            title: "Method",
            width: 64,
            render: (r) => (
              <Text style={styles.cell}>QR</Text>
            ),
          },
          {
            key: "time",
            title: "Time",
            width: 76,
            render: (r) => (
              <Text style={styles.cellStrong}>{formatTimeDisplay(r.recordedAt)}</Text>
            ),
          },
          {
            key: "delete",
            title: "",
            width: 44,
            render: (r) => (
              <IconButton
                icon="trash-bin-outline"
                label={`Delete ${r.studentName} record`}
                variant="danger"
                onPress={() => setConfirmOne(r)}
              />
            ),
          },
        ]}
      />

      <ConfirmModal
        visible={!!confirmOne}
        title="Delete record"
        message={
          confirmOne
            ? `Remove ${confirmOne.studentName}'s ${confirmOne.checkType === "check_in" ? "check-in" : "check-out"} at ${formatTimeDisplay(confirmOne.recordedAt)}?`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setConfirmOne(null)}
        onConfirm={handleDeleteOne}
      />

      <ConfirmModal
        visible={confirmClearDay}
        title="Clear this day"
        message={`Delete all ${stats.total} attendance record(s) for ${formatDateDisplay(filterDate)}? This cannot be undone.`}
        confirmLabel="Clear day"
        onCancel={() => setConfirmClearDay(false)}
        onConfirm={handleClearDay}
      />

      <ConfirmModal
        visible={confirmClearAll}
        title="Clear entire year"
        message="Delete ALL attendance records for the active academic year? This cannot be undone."
        confirmLabel="Clear all"
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={handleClearAll}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 28, gap: 14 },
  filterCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  filterHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  filterTitle: { fontSize: 16, fontWeight: "800", color: colors.primaryDark, flex: 1 },
  clearActions: { flexDirection: "row", gap: 8, flexShrink: 0 },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  clearDayBtn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
  },
  clearAllBtn: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#ffcdd2",
  },
  clearDayText: { fontSize: 11, fontWeight: "800", color: colors.primary },
  clearAllText: { fontSize: 11, fontWeight: "800", color: colors.danger },
  pressed: { opacity: 0.75 },
  filterHint: { fontSize: 12, color: colors.textMuted },
  statsRow: { flexDirection: "row", gap: 10 },
  analysisCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  analysisTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  analysisRow: { flexDirection: "row", alignItems: "center" },
  analysisItem: { flex: 1, alignItems: "center", gap: 4 },
  analysisValue: { fontSize: 22, fontWeight: "800", color: colors.primaryDark },
  analysisLabel: { fontSize: 11, fontWeight: "600", color: colors.textMuted, textAlign: "center" },
  analysisDivider: { width: 1, height: 36, backgroundColor: colors.border },
  tableTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  cell: { fontSize: 12, color: colors.textMuted },
  cellStrong: { fontSize: 13, fontWeight: "700", color: colors.text },
  cellMuted: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeIn: { backgroundColor: colors.accentTealSoft },
  badgeOut: { backgroundColor: colors.accentPeachSoft },
  badgeText: { fontSize: 11, fontWeight: "800" },
  badgeTextIn: { color: colors.accentTeal },
  badgeTextOut: { color: colors.accentPeach },
});
