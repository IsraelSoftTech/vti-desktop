import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Icon from "../../components/Icon";
import TextField from "../../components/TextField";
import SelectField from "../../components/SelectField";
import PrimaryButton from "../../components/PrimaryButton";
import QrScanModal from "../../components/QrScanModal";
import FeeRecordView from "../../components/FeeRecordView";
import {
  getStudentFeeRecord,
  getStudentFeeRecordByBarcode,
  recordFeePayment,
  searchFeeStudents,
  type FeeHeadRecord,
  type FeeRecord,
  type FeeStudentSummary,
  type PaymentChannel,
} from "../../api/fees";
import { getClasses, type SchoolClass } from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { formatMoney, parseMoneyInput } from "../../utils/currency";
import "../../styles/pagePanel.css";
import "./feePaymentTab.css";

type PayStep = "class" | "students";

function feeChipColor(f: FeeHeadRecord) {
  if (f.expectedAmount <= 0) return "var(--color-text-muted)";
  if (f.balance <= 0) return "var(--color-accent-teal)";
  if (f.totalPaid > 0) return "var(--color-accent-peach)";
  return "var(--color-danger)";
}

export default function FeePaymentTab() {
  const { showToast } = useToast();
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedStudent, setScannedStudent] = useState<FeeStudentSummary | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payStep, setPayStep] = useState<PayStep>("class");
  const [classId, setClassId] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [classStudents, setClassStudents] = useState<FeeStudentSummary[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [selected, setSelected] = useState<FeeStudentSummary | null>(null);
  const [record, setRecord] = useState<FeeRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [payFeeHeadId, setPayFeeHeadId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payChannel, setPayChannel] = useState<PaymentChannel | "">("");
  const [payReference, setPayReference] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const classesLoader = useCallback(() => getClasses(), []);
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });

  const classOptions = useMemo(
    () => (classes || []).map((c) => ({ label: c.name, value: String(c.id) })),
    [classes]
  );

  const configuredHeads = useMemo(
    () => (record?.feeHeads || []).filter((f) => f.expectedAmount > 0),
    [record]
  );

  const payableHeads = useMemo(
    () => configuredHeads.filter((f) => f.balance > 0),
    [configuredHeads]
  );

  const selectedPayHead = useMemo(
    () => payableHeads.find((f) => f.feeHeadId === payFeeHeadId) ?? null,
    [payableHeads, payFeeHeadId]
  );

  useEffect(() => {
    if (!payOpen || payStep !== "students" || !classId) {
      setClassStudents([]);
      setStudentsError("");
      setStudentsLoading(false);
      return;
    }

    let active = true;
    setStudentsLoading(true);
    setStudentsError("");

    searchFeeStudents({ classId: Number(classId) })
      .then((rows) => {
        if (active) setClassStudents(rows);
      })
      .catch((e) => {
        if (active) {
          setClassStudents([]);
          setStudentsError(e instanceof Error ? e.message : "Could not load students");
        }
      })
      .finally(() => {
        if (active) setStudentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [payOpen, payStep, classId]);

  const filteredStudents = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return classStudents;
    return classStudents.filter((s) => (s.fullName || "").toLowerCase().includes(q));
  }, [classStudents, nameQuery]);

  function resetPayment() {
    setSelected(null);
    setRecord(null);
    setPayModal(false);
    setPayFeeHeadId(null);
    setPayAmount("");
    setPayChannel("");
    setPayReference("");
  }

  function closePayFlow() {
    setPayOpen(false);
    setPayStep("class");
    setClassId("");
    setNameQuery("");
    setClassStudents([]);
    setStudentsError("");
    resetPayment();
  }

  async function loadRecord(student: FeeStudentSummary, existingRecord?: FeeRecord | null) {
    setSelected(student);
    if (existingRecord) {
      setRecord(existingRecord);
      return;
    }
    setLoadingRecord(true);
    try {
      const rec = await getStudentFeeRecord(student.id);
      setRecord(rec);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load fee record", "err");
    } finally {
      setLoadingRecord(false);
    }
  }

  async function handleScan(code: string) {
    setScanOpen(false);
    setScanning(true);
    try {
      const rec = await getStudentFeeRecordByBarcode(code);
      setScannedStudent(rec.student);
      showToast(`Scanned ${rec.student.fullName}.`);
    } catch (e) {
      setScannedStudent(null);
      showToast(e instanceof Error ? e.message : "Student not found", "err");
    } finally {
      setScanning(false);
    }
  }

  function openPayForHead(head: FeeHeadRecord) {
    if (head.balance <= 0 || head.expectedAmount <= 0) {
      showToast("This fee type is fully paid or not configured.", "err");
      return;
    }
    setPayFeeHeadId(head.feeHeadId);
    setPayAmount(String(head.balance));
    setPayChannel("");
    setPayReference("");
    setPayModal(true);
  }

  async function handlePay() {
    if (!selected || !selectedPayHead) return;
    const amount = parseMoneyInput(payAmount);
    if (amount <= 0) {
      showToast("Enter a valid payment amount.", "err");
      return;
    }
    if (amount > selectedPayHead.balance) {
      showToast(`Cannot pay more than balance (${formatMoney(selectedPayHead.balance)}).`, "err");
      return;
    }
    if (payChannel !== "cash" && payChannel !== "bank") {
      showToast("Select Cash or Bank.", "err");
      return;
    }
    if (payChannel === "bank" && !payReference.trim()) {
      showToast("Enter the bank reference number.", "err");
      return;
    }
    setPayBusy(true);
    try {
      const result = await recordFeePayment({
        studentId: selected.id,
        feeHeadId: selectedPayHead.feeHeadId,
        amount,
        channel: payChannel,
        ...(payChannel === "bank" ? { reference: payReference.trim() } : {}),
      });
      setRecord(result.record);
      setPayModal(false);
      setPayFeeHeadId(null);
      setPayChannel("");
      setPayReference("");
      showToast(`Payment of ${formatMoney(amount)} recorded.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Payment failed", "err");
    } finally {
      setPayBusy(false);
    }
  }

  function renderPayModal() {
    if (!payModal) return null;
    return (
      <div
        className="fee-payment-modal-backdrop"
        role="presentation"
        onClick={() => setPayModal(false)}
      >
        <div
          className="fee-payment-modal-sheet"
          role="dialog"
          aria-labelledby="fee-pay-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="fee-payment-modal-handle" aria-hidden />
          <h2 id="fee-pay-modal-title" className="fee-payment-modal-title">
            Record Payment
          </h2>
          {selected ? <p className="fee-payment-modal-sub">{selected.fullName}</p> : null}

          {payableHeads.length > 1 ? (
            <>
              <p className="fee-payment-section-label">Fee type</p>
              <div className="fee-payment-chip-row">
                {payableHeads.map((f) => {
                  const active = payFeeHeadId === f.feeHeadId;
                  return (
                    <button
                      key={f.feeHeadId}
                      type="button"
                      className={`fee-payment-modal-chip${active ? " fee-payment-modal-chip--active" : ""}`}
                      onClick={() => {
                        setPayFeeHeadId(f.feeHeadId);
                        setPayAmount(String(f.balance));
                      }}
                    >
                      <span
                        className={`fee-payment-modal-chip-text${active ? " fee-payment-modal-chip-text--active" : ""}`}
                      >
                        {f.name}
                      </span>
                      <span className="fee-payment-modal-chip-bal">Bal. {formatMoney(f.balance)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : selectedPayHead ? (
            <div className="fee-payment-selected-fee">
              <span className="fee-payment-selected-fee-label">Fee type</span>
              <div className="fee-payment-selected-fee-name">{selectedPayHead.name}</div>
            </div>
          ) : null}

          {selectedPayHead ? (
            <div className="fee-payment-balance-box">
              <div className="fee-payment-balance-item">
                <span className="fee-payment-balance-label">Stated</span>
                <span className="fee-payment-balance-val">{formatMoney(selectedPayHead.expectedAmount)}</span>
              </div>
              <div className="fee-payment-balance-item">
                <span className="fee-payment-balance-label">Paid</span>
                <span className="fee-payment-balance-val fee-payment-balance-val--paid">
                  {formatMoney(selectedPayHead.totalPaid)}
                </span>
              </div>
              <div className="fee-payment-balance-item">
                <span className="fee-payment-balance-label">Balance</span>
                <span className="fee-payment-balance-val fee-payment-balance-val--owing">
                  {formatMoney(selectedPayHead.balance)}
                </span>
              </div>
            </div>
          ) : null}

          <TextField
            label="Amount to pay"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
          <p className="fee-payment-section-label">Method</p>
          <div className="fee-payment-tender-row">
            {(["cash", "bank"] as const).map((channel) => {
              const active = payChannel === channel;
              return (
                <button
                  key={channel}
                  type="button"
                  className={`fee-payment-tender-chip${active ? " fee-payment-tender-chip--active" : ""}`}
                  onClick={() => {
                    setPayChannel(channel);
                    if (channel === "cash") setPayReference("");
                  }}
                >
                  {channel === "cash" ? "Cash" : "Bank"}
                </button>
              );
            })}
          </div>
          {payChannel === "bank" ? (
            <TextField
              label="Reference number"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="e.g. 001GC0"
            />
          ) : null}
          <PrimaryButton
            title={payBusy ? "Processing…" : "Confirm Payment"}
            loading={payBusy}
            disabled={payChannel !== "cash" && !(payChannel === "bank" && payReference.trim())}
            onClick={handlePay}
          />
          <PrimaryButton title="Cancel" variant="secondary" onClick={() => setPayModal(false)} />
        </div>
      </div>
    );
  }

  function renderPaymentPanel() {
    if (!selected) return null;

    return (
      <div className="fee-payment-card">
        <div>
          <button
            type="button"
            className="fee-payment-back"
            onClick={() => {
              resetPayment();
              if (payOpen) setPayStep("students");
            }}
          >
            ← Back
          </button>
          <h2 className="fee-payment-title">{selected.fullName}</h2>
          <p className="fee-payment-sub">
            {selected.className || "No class"} · {selected.barcode}
          </p>
        </div>

        {loadingRecord ? (
          <p className="fee-payment-loading">Loading fee record…</p>
        ) : record ? (
          <>
            {configuredHeads.length ? (
              <>
                <p className="fee-payment-section-label">Select fee type to pay</p>
                <div className="fee-payment-chip-row">
                  {configuredHeads.map((f) => {
                    const payable = f.balance > 0;
                    const color = feeChipColor(f);
                    return (
                      <button
                        key={f.feeHeadId}
                        type="button"
                        className="fee-payment-chip"
                        style={{ borderColor: `${color}66` }}
                        onClick={() => payable && openPayForHead(f)}
                        disabled={!payable}
                      >
                        <span className="fee-payment-chip-name" style={{ color }}>
                          {f.name}
                        </span>
                        <span className="fee-payment-chip-bal">Bal. {formatMoney(f.balance)}</span>
                        <span className="fee-payment-chip-meta">
                          {formatMoney(f.totalPaid)} / {formatMoney(f.expectedAmount)}
                        </span>
                        {payable ? (
                          <span className="fee-payment-pay-tag" style={{ backgroundColor: `${color}22`, color }}>
                            Tap to pay
                          </span>
                        ) : (
                          <span className="fee-payment-paid-tag">Paid</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="fee-payment-warn">
                <Icon name="information-circle" size={20} />
                <span>
                  No fees configured for this student&apos;s class. Set class fees in Management first.
                </span>
              </div>
            )}

            <FeeRecordView
              record={record}
              showPrint={false}
              managePayments
              onRecordChange={setRecord}
            />
          </>
        ) : null}
      </div>
    );
  }

  let body: ReactNode;

  if (selected) {
    body = renderPaymentPanel();
  } else if (payOpen) {
    body = (
      <div className="fee-payment-card">
        <button type="button" className="fee-payment-back" onClick={closePayFlow}>
          ← Back
        </button>

        {payStep === "class" ? (
          <>
            <h2 className="fee-payment-flow-title">Select class</h2>
            <p className="fee-payment-flow-sub">Choose a class to see its students.</p>
            <SelectField
              label="Class"
              value={classId}
              options={classOptions}
              onChange={(v) => {
                setClassId(v);
                setNameQuery("");
                if (v) setPayStep("students");
              }}
              placeholder="Select class"
            />
          </>
        ) : (
          <>
            <h2 className="fee-payment-flow-title">Select student</h2>
            <p className="fee-payment-flow-sub">
              {classOptions.find((c) => c.value === classId)?.label || "Class"} ·{" "}
              {filteredStudents.length} student{filteredStudents.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              className="fee-payment-change-class"
              onClick={() => {
                setPayStep("class");
                setClassId("");
                setNameQuery("");
              }}
            >
              Change class
            </button>
            <TextField
              label="Search by name"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Type student name"
            />
            {studentsLoading ? <p className="fee-payment-loading">Loading students…</p> : null}
            {studentsError ? <p className="fee-payment-error">{studentsError}</p> : null}
            <div className="fee-payment-student-list">
              {filteredStudents.length ? (
                filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="fee-payment-student-row"
                    onClick={() => loadRecord(s)}
                  >
                    <div>
                      <div className="fee-payment-student-name">{s.fullName}</div>
                      <div className="fee-payment-student-meta">{s.barcode}</div>
                    </div>
                    <Icon name="chevron-forward" size={18} />
                  </button>
                ))
              ) : (
                <p className="fee-payment-empty">
                  {nameQuery.trim() ? "No students match your search." : "No students in this class."}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    );
  } else {
    body = (
      <div className="fee-payment-card fee-payment-menu">
        <h2 className="fee-payment-menu-heading">Scan to pay or pay directly</h2>

        <div className="fee-payment-action-row">
          <button
            type="button"
            className="fee-payment-action-btn fee-payment-action-btn--scan"
            onClick={() => setScanOpen(true)}
          >
            <Icon name="scan-outline" size={28} />
            Scan
          </button>

          <button
            type="button"
            className="fee-payment-action-btn fee-payment-action-btn--pay"
            onClick={() => setPayOpen(true)}
          >
            <Icon name="cash-outline" size={28} />
            Pay
          </button>
        </div>

        {scannedStudent ? (
          <button
            type="button"
            className="fee-payment-scanned"
            onClick={() => loadRecord(scannedStudent)}
          >
            <div className="fee-payment-scanned-icon">
              <Icon name="person-circle-outline" size={22} />
            </div>
            <div className="fee-payment-scanned-text">
              <div className="fee-payment-scanned-label">Scanned student</div>
              <div className="fee-payment-scanned-name">{scannedStudent.fullName}</div>
              <div className="fee-payment-scanned-hint">Tap to open payment</div>
            </div>
            <Icon name="chevron-forward" size={20} />
          </button>
        ) : null}

        {scanning ? <p className="fee-payment-loading">Looking up student…</p> : null}
      </div>
    );
  }

  return (
    <div className="page-panel">
      <div className="page-panel__inner">
        <div className="fee-payment-scroll">{body}</div>
      </div>

      <QrScanModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={handleScan}
        onTimeout={() => {
          setScanOpen(false);
          showToast("Scan timed out. Try again.", "err");
        }}
      />

      {renderPayModal()}
    </div>
  );
}
