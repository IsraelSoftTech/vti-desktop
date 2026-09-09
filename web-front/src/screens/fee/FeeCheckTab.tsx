import { useCallback, useState } from "react";
import Icon from "../../components/Icon";
import PrimaryButton from "../../components/PrimaryButton";
import QrScanModal from "../../components/QrScanModal";
import FeeRecordView from "../../components/FeeRecordView";
import FeeSectionHeader from "../../components/FeeSectionHeader";
import { getSettings } from "../../api/academics";
import { getStudentFeeRecordByBarcode, type FeeRecord } from "../../api/fees";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { printFeeRecord } from "../../utils/feeRecordPdf";
import "../../styles/pagePanel.css";
import "./feeCheckTab.css";

export default function FeeCheckTab() {
  const { showToast } = useToast();
  const [scanOpen, setScanOpen] = useState(false);
  const [record, setRecord] = useState<FeeRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  const settingsLoader = useCallback(() => getSettings(), []);
  const { data: settings } = useCachedQuery(settingsLoader, {
    cacheKey: "settings",
    maxAgeMs: 120_000,
  });

  async function loadByBarcode(code: string) {
    setScanOpen(false);
    setLoading(true);
    try {
      const rec = await getStudentFeeRecordByBarcode(code);
      setRecord(rec);
      showToast(`Fee record loaded for ${rec.student.fullName}.`);
    } catch (e) {
      setRecord(null);
      showToast(e instanceof Error ? e.message : "Student not found", "err");
    } finally {
      setLoading(false);
    }
  }

  async function handlePrint() {
    if (!record) return;
    setPrintBusy(true);
    try {
      await printFeeRecord(record, settings?.schoolName);
      showToast("Fee statement ready to share/print.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Print failed", "err");
    } finally {
      setPrintBusy(false);
    }
  }

  return (
    <div className="page-panel">
      <div className="page-panel__inner">
        <div className="fee-check-scroll">
          <div className="fee-check-hero">
            <div className="fee-check-hero-icon">
              <Icon name="qr-code" size={32} />
            </div>
            <FeeSectionHeader
              title="Scan Student ID"
              subtitle="Scan the QR code on the student's ID card to instantly view their full fee history, balances, and payment status."
            />
            <PrimaryButton title="Scan Fee" onClick={() => setScanOpen(true)} fullWidth />
          </div>

          {loading ? (
            <p className="fee-check-loading">Loading fee record…</p>
          ) : record ? (
            <div className="fee-check-record-wrap">
              <FeeRecordView record={record} onPrint={handlePrint} printBusy={printBusy} />
            </div>
          ) : (
            <div className="fee-check-placeholder">
              <Icon name="scan-outline" size={36} />
              <p className="fee-check-placeholder-title">No fee record loaded yet.</p>
              <p className="fee-check-placeholder-sub">Tap Scan Fee and point at the student ID card.</p>
            </div>
          )}
        </div>
      </div>

      <QrScanModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={loadByBarcode}
        onTimeout={() => {
          setScanOpen(false);
          showToast("Scan timed out. Try again.", "err");
        }}
      />
    </div>
  );
}
