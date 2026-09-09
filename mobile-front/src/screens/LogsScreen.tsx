import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "../components/PrimaryButton";
import TextField from "../components/TextField";
import ScreenLayout from "../components/ScreenLayout";
import { clearActivityLogs, getActivityLogs, type ActivityLog } from "../api/logs";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";
import { formatDateTime12 } from "../utils/dateTime";

const PAGE_SIZES = [10, 25, 50];

function formatWhen(iso?: string | null) {
  return formatDateTime12(iso);
}

function sourceLabel(source?: string | null) {
  if (source === "mobile") return "Mobile";
  if (source === "desktop") return "Desktop";
  if (source === "web") return "Web";
  if (source === "api") return "API";
  return source || "—";
}

function roleLabel(role?: string | null) {
  if (role === "attendance_admin") return "Admin";
  if (role === "attendance_accountant") return "Accountant";
  if (role === "attendance_parent") return "Parent";
  if (role === "sync_device") return "Desktop";
  return role || "—";
}

export default function LogsScreen({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      try {
        const data = await getActivityLogs({
          limit: pageSize,
          offset: (page - 1) * pageSize,
          q,
        });
        setItems(data.items);
        setTotal(data.total);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load logs", "err");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, q, showToast]
  );

  useEffect(() => {
    void load({ silent: true });
  }, [load]);

  function confirmClear() {
    Alert.alert(
      "Clear all logs?",
      "This permanently deletes the activity history. A single entry will be kept to record that the logs were cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear logs",
          style: "destructive",
          onPress: () => void handleClear(),
        },
      ]
    );
  }

  async function handleClear() {
    setClearing(true);
    try {
      await clearActivityLogs();
      setPage(1);
      showToast("Logs cleared.");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not clear logs", "err");
    } finally {
      setClearing(false);
    }
  }

  const body = (
    <ScrollView
      contentContainerStyle={[styles.scroll, embedded && styles.embeddedScroll]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load()}
          tintColor={colors.primary}
        />
      }
    >
      {embedded ? null : (
        <View style={styles.hero}>
          <Ionicons name="list-outline" size={28} color={colors.primary} />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Logs</Text>
            <Text style={styles.heroSub}>
              Every sign-in, change, and sync recorded on this system.
            </Text>
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <View style={styles.actionBtn}>
          <PrimaryButton
            title={refreshing ? "Refreshing…" : "Refresh"}
            loading={refreshing}
            onPress={() => void load()}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={clearing || (!total && !items.length)}
          onPress={confirmClear}
          style={({ pressed }) => [
            styles.clearBtn,
            (clearing || (!total && !items.length)) && styles.clearBtnOff,
            pressed && styles.clearBtnPressed,
          ]}
        >
          {clearing ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.clearBtnText}>Clear logs</Text>
          )}
        </Pressable>
      </View>

      <TextField
        label="Search"
        value={q}
        onChangeText={(value) => {
          setPage(1);
          setQ(value);
        }}
        placeholder="User, action, or path"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {loading && !items.length ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Loading logs…</Text>
        </View>
      ) : items.length ? (
        items.map((row) => (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.when}>{formatWhen(row.occurred_at)}</Text>
              <Text style={styles.source}>{sourceLabel(row.source)}</Text>
            </View>
            <Text style={styles.summary}>{row.summary}</Text>
            <Text style={styles.who}>
              {row.actor_username || "System"} · {roleLabel(row.actor_role)}
            </Text>
            {row.path ? (
              <Text style={styles.path}>
                {row.method} {row.path}
                {row.status_code ? ` · ${row.status_code}` : ""}
              </Text>
            ) : null}
          </View>
        ))
      ) : (
        <Text style={styles.hint}>No activity recorded yet.</Text>
      )}

      {total > 0 ? (
        <View style={styles.pager}>
          <Text style={styles.hint}>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </Text>
          <View style={styles.pageSizes}>
            {PAGE_SIZES.map((n) => (
              <Pressable
                key={n}
                style={[styles.pageSizeChip, pageSize === n && styles.pageSizeChipActive]}
                onPress={() => {
                  setPageSize(n);
                  setPage(1);
                }}
              >
                <Text style={[styles.pageSizeText, pageSize === n && styles.pageSizeTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.pageNav}>
            <Pressable disabled={page <= 1} onPress={() => setPage(Math.max(1, page - 1))}>
              <Text style={[styles.pageLink, page <= 1 && styles.pageLinkOff]}>Prev</Text>
            </Pressable>
            <Text style={styles.hint}>
              {page} / {pages}
            </Text>
            <Pressable disabled={page >= pages} onPress={() => setPage(Math.min(pages, page + 1))}>
              <Text style={[styles.pageLink, page >= pages && styles.pageLinkOff]}>Next</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );

  if (embedded) return <View style={styles.embedded}>{body}</View>;
  return <ScreenLayout>{body}</ScreenLayout>;
}

const styles = StyleSheet.create({
  embedded: { flex: 1, width: "100%" },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  embeddedScroll: { paddingTop: 8 },
  hero: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 20, fontWeight: "800", color: colors.primaryDark },
  heroSub: { marginTop: 4, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  actionBtn: { flexGrow: 1, minWidth: 120 },
  clearBtn: {
    backgroundColor: colors.danger,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    minHeight: 50,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  clearBtnOff: { opacity: 0.55 },
  clearBtnPressed: { transform: [{ scale: 0.98 }] },
  clearBtnText: { color: colors.white, fontSize: 14, fontWeight: "700" },
  loadingBox: { alignItems: "center", paddingVertical: 24, gap: 8 },
  hint: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  when: { fontSize: 12, fontWeight: "700", color: colors.primary },
  source: { fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase" },
  summary: { fontSize: 14, fontWeight: "800", color: colors.text, lineHeight: 20 },
  who: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  path: { fontSize: 11, color: colors.textMuted },
  pager: { gap: 10, paddingTop: 4 },
  pageSizes: { flexDirection: "row", gap: 8 },
  pageSizeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  pageSizeChipActive: { backgroundColor: colors.primary },
  pageSizeText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  pageSizeTextActive: { color: colors.white },
  pageNav: { flexDirection: "row", alignItems: "center", gap: 12 },
  pageLink: { fontSize: 13, fontWeight: "800", color: colors.primary },
  pageLinkOff: { color: colors.border },
});
