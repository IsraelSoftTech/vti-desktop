import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "../components/PrimaryButton";
import SelectField from "../components/SelectField";
import TextField from "../components/TextField";
import StatCard from "../components/StatCard";
import ScreenLayout from "../components/ScreenLayout";
import SegmentTabs from "../components/SegmentTabs";
import ParentChatAdminPanel from "./messages/ParentChatAdminPanel";
import { getSmsCredit, getSmsMessages, type SmsCredit, type SmsMessage } from "../api/sms";
import { isAccountant } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";
import { formatDateTime12 } from "../utils/dateTime";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "queued", label: "Queued" },
  { value: "failed", label: "Failed" },
  { value: "undelivered", label: "Undelivered" },
];

const KIND_OPTIONS = [
  { value: "", label: "All types" },
  { value: "pair_summary", label: "Pair summary" },
  { value: "absence", label: "Absence" },
  { value: "missed_checkout", label: "Missed checkout" },
  { value: "check_in", label: "Check-in" },
  { value: "check_out", label: "Check-out" },
  { value: "daily_summary", label: "Daily summary" },
  { value: "announcement", label: "Announcement" },
  { value: "other", label: "Other" },
];

const PAGE_SIZES = [10, 25, 50];

function statusColor(status: string) {
  if (status === "delivered") return colors.accentTeal;
  if (status === "sent") return colors.primary;
  if (status === "queued") return colors.accentPeach;
  return colors.danger;
}

function formatWhen(iso?: string | null) {
  return formatDateTime12(iso);
}

export default function MessagesScreen({
  embedded = false,
  onParentChatOpenChange,
}: {
  embedded?: boolean;
  onParentChatOpenChange?: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const accountant = isAccountant(user);
  const [segment, setSegment] = useState<"sms" | "parents">(accountant ? "parents" : "sms");
  const [chatOpen, setChatOpen] = useState(false);
  const [credit, setCredit] = useState<SmsCredit | null>(null);
  const [items, setItems] = useState<SmsMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (accountant) return;
      if (!opts?.silent) setRefreshing(true);
      try {
        const [creditData, list] = await Promise.all([
          getSmsCredit(),
          getSmsMessages({ page, pageSize, status, kind, q }),
        ]);
        setCredit(creditData);
        setItems(list.items);
        setTotal(list.total);
        if (list.page !== page) setPage(list.page);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load messages", "err");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountant, page, pageSize, status, kind, q, showToast]
  );

  useEffect(() => {
    if (accountant) {
      setLoading(false);
      return;
    }
    void load({ silent: true });
  }, [load, accountant]);

  useEffect(() => {
    if (accountant) return;
    const id = setInterval(() => {
      void load({ silent: true });
    }, 30000);
    return () => clearInterval(id);
  }, [load, accountant]);

  const creditLabel = credit?.credit == null ? "—" : Number(credit.credit).toLocaleString();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const handleThreadOpenChange = useCallback(
    (open: boolean) => {
      setChatOpen(open);
      onParentChatOpenChange?.(open);
    },
    [onParentChatOpenChange]
  );

  const tabs = accountant
    ? [{ id: "sms" as const, label: "SMS" }]
    : [
        { id: "sms" as const, label: "SMS" },
        { id: "parents" as const, label: "Parents" },
      ];

  const parentsBody = (
    <View
      style={[
        styles.parentsWrap,
        embedded && styles.embeddedParents,
        chatOpen && styles.parentsWrapThread,
      ]}
    >
      {chatOpen || accountant ? null : (
        <SegmentTabs tabs={tabs} active={segment} onChange={setSegment} equalWidth />
      )}
      <ParentChatAdminPanel onThreadOpenChange={handleThreadOpenChange} />
    </View>
  );

  const body = (
    <ScrollView
      contentContainerStyle={[styles.scroll, embedded && styles.embeddedScroll]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={colors.primary} />
      }
    >
      {!accountant ? (
        <SegmentTabs tabs={tabs} active={segment} onChange={setSegment} equalWidth />
      ) : null}
      <View style={styles.hero}>
        <Ionicons name="chatbubbles-outline" size={28} color={colors.primary} />
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Messages</Text>
          <Text style={styles.heroSub}>
            Guardian SMS sent through MPASAT. Status updates when the network reports delivery.
          </Text>
        </View>
      </View>

      {credit && !credit.configured ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            SMS is not configured on the server. Set SMS_API_USER and SMS_API_PASSWORD, then restart
            the API.
          </Text>
        </View>
      ) : null}

      {credit?.error && credit.configured ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{credit.error}</Text>
        </View>
      ) : null}

      <View style={styles.stats}>
        <StatCard
          label="SMS credit"
          value={creditLabel}
          icon="wallet-outline"
          accent={colors.primary}
          accentSoft={colors.primarySoft}
        />
        <StatCard
          label="Sent today"
          value={String(credit?.stats.sentToday ?? 0)}
          icon="chatbubbles-outline"
          accent={colors.accentTeal}
          accentSoft={colors.accentTealSoft}
        />
        <StatCard
          label="Delivered"
          value={String(credit?.stats.delivered ?? 0)}
          icon="checkmark-circle-outline"
          accent={colors.accentTeal}
          accentSoft={colors.accentTealSoft}
        />
        <StatCard
          label="Failed"
          value={String(credit?.stats.failed ?? 0)}
          icon="alert-circle-outline"
          accent={colors.danger}
          accentSoft={colors.dangerSoft}
        />
      </View>

      {credit?.senderId || credit?.accountExpDate || credit?.balanceExpDate ? (
        <Text style={styles.expiry}>
          {credit.senderId ? `Sender ${credit.senderId}` : ""}
          {credit.senderId && (credit.accountExpDate || credit.balanceExpDate) ? " · " : ""}
          {credit.accountExpDate ? `Account expires ${credit.accountExpDate}` : ""}
          {credit.accountExpDate && credit.balanceExpDate ? " · " : ""}
          {credit.balanceExpDate ? `Balance expires ${credit.balanceExpDate}` : ""}
        </Text>
      ) : null}

      <View style={styles.card}>
        <View style={styles.toolbar}>
          <Text style={styles.cardTitle}>Sent messages</Text>
          <PrimaryButton
            title={refreshing ? "Refreshing…" : "Refresh"}
            loading={refreshing}
            variant="secondary"
            onPress={() => void load()}
          />
        </View>
        <TextField
          label="Search"
          value={q}
          onChangeText={(value) => {
            setPage(1);
            setQ(value);
          }}
          placeholder="Name, phone, or message"
        />
        <SelectField
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
          onChange={(value) => {
            setPage(1);
            setStatus(value);
          }}
        />
        <SelectField
          label="Type"
          value={kind}
          options={KIND_OPTIONS}
          placeholder="All types"
          onChange={(value) => {
            setPage(1);
            setKind(value);
          }}
        />

        {loading && !items.length ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.hint}>Loading messages…</Text>
          </View>
        ) : items.length ? (
          items.map((row) => (
            <View key={row.id} style={styles.msg}>
              <View style={styles.msgTop}>
                <Text style={styles.msgWhen}>{formatWhen(row.createdAt)}</Text>
                <Text style={[styles.msgStatus, { color: statusColor(String(row.status)) }]}>
                  {row.status}
                </Text>
              </View>
              <Text style={styles.msgKind}>{row.kindLabel}</Text>
              <Text style={styles.msgName}>{row.studentName || "Guardian"}</Text>
              <Text style={styles.msgMeta}>{row.mobile || "—"}</Text>
              <Text style={styles.msgBody}>{row.body}</Text>
              {row.errorDescription ? (
                <Text style={styles.msgErr}>{row.errorDescription}</Text>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.hint}>No SMS has been sent yet.</Text>
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
              <Pressable disabled={page <= 1} onPress={() => setPage(1)}>
                <Text style={[styles.pageLink, page <= 1 && styles.pageLinkOff]}>First</Text>
              </Pressable>
              <Pressable disabled={page <= 1} onPress={() => setPage(page - 1)}>
                <Text style={[styles.pageLink, page <= 1 && styles.pageLinkOff]}>Prev</Text>
              </Pressable>
              <Text style={styles.hint}>
                {page} / {pages}
              </Text>
              <Pressable disabled={page >= pages} onPress={() => setPage(page + 1)}>
                <Text style={[styles.pageLink, page >= pages && styles.pageLinkOff]}>Next</Text>
              </Pressable>
              <Pressable disabled={page >= pages} onPress={() => setPage(pages)}>
                <Text style={[styles.pageLink, page >= pages && styles.pageLinkOff]}>Last</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );

  if (accountant || segment === "parents") {
    if (embedded) return <View style={styles.embedded}>{parentsBody}</View>;
    return <ScreenLayout>{parentsBody}</ScreenLayout>;
  }

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
  warn: { backgroundColor: "#fff3cd", padding: 12, borderRadius: 10 },
  warnText: { color: "#856404", fontSize: 13, lineHeight: 18 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  expiry: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.primaryDark },
  loadingBox: { alignItems: "center", gap: 8, paddingVertical: 20 },
  hint: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  msg: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 3,
  },
  msgTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  msgWhen: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  msgStatus: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  msgKind: { fontSize: 12, fontWeight: "700", color: colors.primary },
  msgName: { fontSize: 14, fontWeight: "800", color: colors.text },
  msgMeta: { fontSize: 12, color: colors.textMuted },
  msgBody: { fontSize: 13, color: colors.text, lineHeight: 18 },
  msgErr: { fontSize: 12, color: colors.danger, fontWeight: "600" },
  pager: { gap: 8, paddingTop: 8 },
  pageSizes: { flexDirection: "row", gap: 6 },
  pageSizeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pageSizeChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pageSizeText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  pageSizeTextActive: { color: colors.primary },
  pageNav: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  pageLink: { fontSize: 13, fontWeight: "800", color: colors.primary },
  pageLinkOff: { color: colors.textMuted },
  parentsWrap: { flex: 1, minHeight: 0, padding: 12, gap: 8 },
  parentsWrapThread: { padding: 0, gap: 0 },
  embeddedParents: { paddingTop: 8 },
});
