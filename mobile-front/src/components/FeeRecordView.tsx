import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "./PrimaryButton";
import DataTable from "./DataTable";
import ConfirmModal from "./ConfirmModal";
import type { FeePayment, FeeRecord, PaymentChannel } from "../api/fees";
import { deleteFeePayment, paymentChannelLabel, updateFeePayment } from "../api/fees";
import { useToast } from "../context/ToastContext";
import { formatMoney, parseMoneyInput } from "../utils/currency";
import { formatDateTimeDisplay } from "../utils/dateTime";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

type Props = {
  record: FeeRecord;
  onPrint?: () => void;
  printBusy?: boolean;
  showPrint?: boolean;
  showBreakdown?: boolean;
  managePayments?: boolean;
  onRecordChange?: (record: FeeRecord) => void;
};

function statusColor(status: string, colors: AppColors) {
  if (status === "completed" || status === "paid") return colors.accentTeal;
  if (status === "not_set") return colors.textMuted;
  if (status === "owing" || status === "partial" || status === "unpaid") return colors.danger;
  return colors.textMuted;
}

function statusLabel(status: string) {
  if (status === "completed") return "Fully Paid";
  if (status === "owing") return "Balance Owing";
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  if (status === "unpaid") return "Unpaid";
  if (status === "not_set") return "Not Set";
  return "No Fees";
}

export default function FeeRecordView({
  record,
  onPrint,
  printBusy,
  showPrint = true,
  showBreakdown = true,
  managePayments = false,
  onRecordChange,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { showToast } = useToast();
  const { feeHeads, payments, summary } = record;
  const configured = feeHeads.filter((f) => f.expectedAmount > 0);

  const [editId, setEditId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editChannel, setEditChannel] = useState<PaymentChannel>("cash");
  const [editNote, setEditNote] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<FeePayment | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function applyRecord(next: FeeRecord) {
    onRecordChange?.(next);
  }

  async function handleSaveEdit() {
    if (editId == null) return;
    const amount = parseMoneyInput(editAmount);
    if (amount <= 0) {
      showToast("Enter a valid payment amount.", "err");
      return;
    }
    if (editChannel === "bank" && !editNote.trim()) {
      showToast("Enter the bank reference number.", "err");
      return;
    }
    setEditBusy(true);
    try {
      const result = await updateFeePayment(editId, {
        amount,
        channel: editChannel,
        ...(editChannel === "bank"
          ? { reference: editNote.trim() }
          : { note: null }),
      });
      applyRecord(result.record);
      setEditId(null);
      showToast("Payment updated.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update payment", "err");
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleteBusy(true);
    try {
      const result = await deleteFeePayment(deleteConfirm.id);
      applyRecord(result.record);
      if (editId === deleteConfirm.id) setEditId(null);
      setDeleteConfirm(null);
      showToast("Payment deleted.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete payment", "err");
    } finally {
      setDeleteBusy(false);
    }
  }

  const paymentColumns = [
    {
      key: "fee",
      title: "Fee Type",
      width: managePayments ? 100 : 120,
      render: (p: FeePayment) => <Text style={styles.feeName}>{p.feeHeadName}</Text>,
    },
    {
      key: "amount",
      title: "Amount",
      width: managePayments ? 80 : 90,
      render: (p: FeePayment) =>
        editId === p.id ? (
          <TextInput
            value={editAmount}
            onChangeText={setEditAmount}
            style={styles.inlineInput}
            keyboardType="numeric"
            placeholder="Amount"
          />
        ) : (
          <Text style={[styles.num, styles.paid]}>{formatMoney(p.amount)}</Text>
        ),
    },
    {
      key: "date",
      title: "Date",
      width: managePayments ? 100 : 130,
      render: (p: FeePayment) => <Text style={styles.date}>{formatDateTimeDisplay(p.paidAt)}</Text>,
    },
    {
      key: "method",
      title: "Method",
      width: managePayments ? 110 : 70,
      render: (p: FeePayment) =>
        editId === p.id ? (
          <View style={styles.methodChips}>
            {(["cash", "bank"] as const).map((channel) => (
              <Pressable
                key={channel}
                style={[styles.methodChip, editChannel === channel && styles.methodChipActive]}
                onPress={() => {
                  setEditChannel(channel);
                  if (channel === "cash") setEditNote("");
                }}
              >
                <Text style={[styles.methodChipText, editChannel === channel && styles.methodChipTextActive]}>
                  {channel === "cash" ? "Cash" : "Bank"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.method}>{paymentChannelLabel(p.channel)}</Text>
        ),
    },
    {
      key: "reference",
      title: "Reference",
      width: managePayments ? 90 : 110,
      render: (p: FeePayment) =>
        editId === p.id && editChannel === "bank" ? (
          <TextInput
            value={editNote}
            onChangeText={setEditNote}
            style={styles.inlineInput}
            placeholder="e.g. 001GC0"
          />
        ) : (
          <Text style={styles.note}>
            {editId === p.id
              ? editChannel === "bank"
                ? editNote.trim() || "—"
                : "—"
              : p.channel === "bank"
                ? p.note || "—"
                : "—"}
          </Text>
        ),
    },
  ];

  if (managePayments) {
    paymentColumns.push({
      key: "actions",
      title: "",
      width: 110,
      render: (p: FeePayment) =>
        editId === p.id ? (
          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={handleSaveEdit} disabled={editBusy}>
              <Text style={styles.actionSave}>{editBusy ? "…" : "Save"}</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => setEditId(null)}>
              <Text style={styles.actionCancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable
              style={styles.actionBtn}
              onPress={() => {
                setEditId(p.id);
                setEditAmount(String(p.amount));
                setEditChannel(p.channel === "bank" ? "bank" : "cash");
                setEditNote(p.channel === "bank" ? p.note || "" : "");
              }}
            >
              <Text style={styles.actionEdit}>Edit</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => setDeleteConfirm(p)}>
              <Text style={styles.actionDelete}>Delete</Text>
            </Pressable>
          </View>
        ),
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.statusBanner}>
        <Ionicons
          name={summary.status === "completed" ? "checkmark-circle" : summary.status === "owing" ? "alert-circle" : "information-circle"}
          size={22}
          color={statusColor(summary.status, colors)}
        />
        <Text style={[styles.statusText, { color: statusColor(summary.status, colors) }]}>
          {statusLabel(summary.status)}
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryVal}>{formatMoney(summary.totalExpected)}</Text>
          <Text style={styles.summaryLabel}>Expected</Text>
        </View>
        {(summary.discountAmount ?? 0) > 0 ? (
          <View style={styles.summaryBox}>
            <Text style={[styles.summaryVal, { color: colors.accentPeach }]}>
              −{formatMoney(summary.discountAmount ?? 0)}
            </Text>
            <Text style={styles.summaryLabel}>
              Discount{summary.discountSource === "class" ? " (class)" : ""}
            </Text>
          </View>
        ) : null}
        <View style={styles.summaryBox}>
          <Text style={[styles.summaryVal, { color: colors.accentTeal }]}>{formatMoney(summary.totalPaid)}</Text>
          <Text style={styles.summaryLabel}>Paid</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={[styles.summaryVal, { color: summary.totalBalance > 0 ? colors.danger : colors.accentTeal }]}>
            {formatMoney(summary.totalBalance)}
          </Text>
          <Text style={styles.summaryLabel}>Balance</Text>
        </View>
      </View>

      {showBreakdown ? (
        <>
          <Text style={styles.sectionTitle}>Fee Breakdown</Text>
          <DataTable
            data={feeHeads}
            keyExtractor={(f) => f.feeHeadId}
            emptyText="No fee types created yet."
            columns={[
              {
                key: "name",
                title: "Fee Type",
                width: 130,
                render: (f) => (
                  <View>
                    <Text style={styles.feeName}>{f.name}</Text>
                    <Text style={[styles.feeStatus, { color: statusColor(f.status, colors) }]}>{statusLabel(f.status)}</Text>
                  </View>
                ),
              },
              {
                key: "expected",
                title: "Expected",
                width: 90,
                render: (f) => (
                  <Text style={styles.num}>{f.expectedAmount > 0 ? formatMoney(f.expectedAmount) : "—"}</Text>
                ),
              },
              {
                key: "paid",
                title: "Paid",
                width: 90,
                render: (f) => <Text style={[styles.num, styles.paid]}>{formatMoney(f.totalPaid)}</Text>,
              },
              {
                key: "balance",
                title: "Balance",
                width: 90,
                render: (f) => (
                  <Text style={[styles.num, f.balance > 0 ? styles.owing : styles.paid]}>
                    {f.expectedAmount > 0 ? formatMoney(f.balance) : "—"}
                  </Text>
                ),
              },
            ]}
          />
        </>
      ) : null}

      {configured.length === 0 && managePayments ? (
        <Text style={styles.hint}>Configure amounts for this class in Fee Management.</Text>
      ) : null}

      <Text style={styles.sectionTitle}>Payment History</Text>
      {payments.length ? (
        <DataTable
          data={payments}
          keyExtractor={(p) => p.id}
          emptyText="No payments yet."
          columns={paymentColumns}
        />
      ) : (
        <Text style={styles.empty}>No payments recorded yet.</Text>
      )}

      {showPrint && onPrint ? (
        <PrimaryButton
          title={printBusy ? "Preparing…" : "Print Fee Statement"}
          loading={printBusy}
          onPress={onPrint}
          fullWidth
        />
      ) : null}

      <ConfirmModal
        visible={!!deleteConfirm}
        title="Delete payment?"
        message={
          deleteConfirm
            ? `Remove ${formatMoney(deleteConfirm.amount)} payment for ${deleteConfirm.feeHeadName}? The student's paid amount will be reduced.`
            : ""
        }
        confirmLabel={deleteBusy ? "Deleting…" : "Delete"}
        onCancel={() => !deleteBusy && setDeleteConfirm(null)}
        onConfirm={handleDelete}
      />
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  wrap: { gap: 14 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: { fontSize: 15, fontWeight: "900" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryVal: { fontSize: 16, fontWeight: "900", color: colors.primary },
  summaryLabel: { marginTop: 2, fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  sectionTitle: { fontSize: 15, fontWeight: "900", color: colors.primaryDark },
  feeName: { fontSize: 13, fontWeight: "800", color: colors.text },
  feeStatus: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  num: { fontSize: 13, fontWeight: "800", color: colors.text },
  paid: { color: colors.accentTeal },
  discount: { color: colors.accentPeach },
  owing: { color: colors.danger },
  date: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  method: { fontSize: 11, fontWeight: "800", color: colors.text },
  methodChips: { flexDirection: "row", gap: 4 },
  methodChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  methodChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  methodChipText: { fontSize: 11, fontWeight: "800", color: colors.textMuted },
  methodChipTextActive: { color: colors.primaryDark },
  note: { fontSize: 11, fontWeight: "600", color: colors.text, fontStyle: "italic" },
  hint: {
    fontSize: 12,
    color: colors.accentPeach,
    fontWeight: "700",
    backgroundColor: colors.accentPeachSoft,
    padding: 12,
    borderRadius: 12,
  },
  empty: { textAlign: "center", color: colors.textMuted, padding: 16, fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  actionBtn: { paddingVertical: 2, paddingHorizontal: 4 },
  actionSave: { fontSize: 11, fontWeight: "800", color: colors.primary },
  actionCancel: { fontSize: 11, fontWeight: "800", color: colors.textMuted },
  actionEdit: { fontSize: 11, fontWeight: "800", color: colors.primary },
  actionDelete: { fontSize: 11, fontWeight: "800", color: colors.danger },
  inlineInput: {
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "600",
    backgroundColor: colors.surface,
  },
  });
}
