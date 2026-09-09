import { useState } from "react";
import PrimaryButton from "./PrimaryButton";
import DataTable from "./DataTable";
import IconButton from "./IconButton";
import ConfirmModal from "./ConfirmModal";
import Icon from "./Icon";
import type { FeePayment, FeeRecord, PaymentChannel } from "../api/fees";
import { deleteFeePayment, paymentChannelLabel, updateFeePayment } from "../api/fees";
import { useToast } from "../context/ToastContext";
import { formatMoney, parseMoneyInput } from "../utils/currency";
import { formatDateTimeDisplay } from "../utils/dateTime";
import "./FeeRecordView.css";

type Props = {
  record: FeeRecord;
  onPrint?: () => void;
  printBusy?: boolean;
  showPrint?: boolean;
  managePayments?: boolean;
  onRecordChange?: (record: FeeRecord) => void;
};

function statusColor(status: string) {
  if (status === "completed" || status === "paid") return "var(--color-accent-teal)";
  if (status === "not_set") return "var(--color-text-muted)";
  if (status === "owing" || status === "partial" || status === "unpaid") return "var(--color-danger)";
  return "var(--color-text-muted)";
}

function statusIcon(status: string): "checkmark-circle" | "alert-circle" | "information-circle" {
  if (status === "completed") return "checkmark-circle";
  if (status === "owing") return "alert-circle";
  return "information-circle";
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
  managePayments = false,
  onRecordChange,
}: Props) {
  const { showToast } = useToast();
  const { feeHeads, payments, summary } = record;
  const configured = feeHeads.filter((f) => f.expectedAmount > 0);
  const bannerColor = statusColor(summary.status);

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
      render: (p: FeePayment) => <span className="fee-record-view__fee-name">{p.feeHeadName}</span>,
    },
    {
      key: "amount",
      title: "Amount",
      width: managePayments ? 80 : 90,
      render: (p: FeePayment) =>
        editId === p.id ? (
          <input
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            className="fee-record-view__inline-input"
            placeholder="Amount"
            inputMode="decimal"
          />
        ) : (
          <span className="fee-record-view__num fee-record-view__num--paid">{formatMoney(p.amount)}</span>
        ),
    },
    {
      key: "date",
      title: "Date",
      width: managePayments ? 110 : 130,
      render: (p: FeePayment) => (
        <span className="fee-record-view__date">{formatDateTimeDisplay(p.paidAt)}</span>
      ),
    },
    {
      key: "method",
      title: "Method",
      width: managePayments ? 120 : 70,
      render: (p: FeePayment) =>
        editId === p.id ? (
          <div className="fee-record-view__method-chips">
            {(["cash", "bank"] as const).map((channel) => (
              <button
                key={channel}
                type="button"
                className={`fee-record-view__method-chip${
                  editChannel === channel ? " fee-record-view__method-chip--active" : ""
                }`}
                onClick={() => {
                  setEditChannel(channel);
                  if (channel === "cash") setEditNote("");
                }}
              >
                {channel === "cash" ? "Cash" : "Bank"}
              </button>
            ))}
          </div>
        ) : (
          <span className="fee-record-view__method">{paymentChannelLabel(p.channel)}</span>
        ),
    },
    {
      key: "reference",
      title: "Reference",
      width: managePayments ? 90 : 110,
      render: (p: FeePayment) =>
        editId === p.id && editChannel === "bank" ? (
          <input
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            className="fee-record-view__inline-input"
            placeholder="e.g. 001GC0"
          />
        ) : (
          <span className="fee-record-view__note">
            {editId === p.id
              ? editChannel === "bank"
                ? editNote.trim() || "—"
                : "—"
              : p.channel === "bank"
                ? p.note || "—"
                : "—"}
          </span>
        ),
    },
  ];

  if (managePayments) {
    paymentColumns.push({
      key: "actions",
      title: "",
      width: 120,
      render: (p: FeePayment) =>
        editId === p.id ? (
          <div className="fee-record-view__actions">
            <IconButton label={editBusy ? "…" : "Save"} onClick={handleSaveEdit} />
            <IconButton label="Cancel" onClick={() => setEditId(null)} />
          </div>
        ) : (
          <div className="fee-record-view__actions">
            <IconButton
              label="Edit"
              onClick={() => {
                setEditId(p.id);
                setEditAmount(String(p.amount));
                setEditChannel(p.channel === "bank" ? "bank" : "cash");
                setEditNote(p.channel === "bank" ? p.note || "" : "");
              }}
            />
            <IconButton label="Delete" variant="danger" onClick={() => setDeleteConfirm(p)} />
          </div>
        ),
    });
  }

  return (
    <div className="fee-record-view">
      <div className="fee-record-view__banner" style={{ color: bannerColor }}>
        <Icon name={statusIcon(summary.status)} size={22} />
        <span className="fee-record-view__banner-text">{statusLabel(summary.status)}</span>
      </div>

      <div className="fee-record-view__summary">
        <div className="fee-record-view__summary-box">
          <span className="fee-record-view__summary-val">{formatMoney(summary.totalExpected)}</span>
          <span className="fee-record-view__summary-label">Expected</span>
        </div>
        {(summary.discountAmount ?? 0) > 0 ? (
          <div className="fee-record-view__summary-box">
            <span className="fee-record-view__summary-val fee-record-view__summary-val--discount">
              −{formatMoney(summary.discountAmount ?? 0)}
            </span>
            <span className="fee-record-view__summary-label">
              Discount{summary.discountSource === "class" ? " (class)" : ""}
            </span>
          </div>
        ) : null}
        <div className="fee-record-view__summary-box">
          <span className="fee-record-view__summary-val fee-record-view__summary-val--paid">
            {formatMoney(summary.totalPaid)}
          </span>
          <span className="fee-record-view__summary-label">Paid</span>
        </div>
        <div className="fee-record-view__summary-box">
          <span
            className={`fee-record-view__summary-val${
              summary.totalBalance > 0 ? " fee-record-view__summary-val--owing" : " fee-record-view__summary-val--paid"
            }`}
          >
            {formatMoney(summary.totalBalance)}
          </span>
          <span className="fee-record-view__summary-label">Balance</span>
        </div>
      </div>

      <h3 className="fee-record-view__section">Fee Breakdown</h3>
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
              <div>
                <span className="fee-record-view__fee-name">{f.name}</span>
                <span className="fee-record-view__fee-status" style={{ color: statusColor(f.status) }}>
                  {statusLabel(f.status)}
                </span>
              </div>
            ),
          },
          {
            key: "expected",
            title: "Expected",
            width: 90,
            render: (f) => (
              <span className="fee-record-view__num">
                {f.expectedAmount > 0 ? formatMoney(f.expectedAmount) : "—"}
              </span>
            ),
          },
          {
            key: "paid",
            title: "Paid",
            width: 90,
            render: (f) => (
              <span className="fee-record-view__num fee-record-view__num--paid">{formatMoney(f.totalPaid)}</span>
            ),
          },
          {
            key: "balance",
            title: "Balance",
            width: 90,
            render: (f) => (
              <span
                className={`fee-record-view__num${f.balance > 0 ? " fee-record-view__num--owing" : " fee-record-view__num--paid"}`}
              >
                {f.expectedAmount > 0 ? formatMoney(f.balance) : "—"}
              </span>
            ),
          },
        ]}
      />

      {configured.length === 0 ? (
        <p className="fee-record-view__hint">Configure amounts for this class in Fee Management.</p>
      ) : null}

      <h3 className="fee-record-view__section">Payment History</h3>
      {payments.length ? (
        <DataTable
          data={payments}
          keyExtractor={(p) => p.id}
          emptyText="No payments yet."
          columns={paymentColumns}
        />
      ) : (
        <p className="fee-record-view__empty">No payments recorded yet.</p>
      )}

      {showPrint && onPrint ? (
        <PrimaryButton
          title={printBusy ? "Preparing…" : "Print Fee Statement"}
          loading={printBusy}
          onClick={onPrint}
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
    </div>
  );
}
