import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "../../components/PrimaryButton";
import QrScanModal from "../../components/QrScanModal";
import TextField from "../../components/TextField";
import FeeRecordView from "../../components/FeeRecordView";
import FeeSectionHeader from "../../components/FeeSectionHeader";
import { getSettings } from "../../api/academics";
import { getStudentFeeRecordByBarcode, type FeeRecord } from "../../api/fees";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { printFeeRecord } from "../../utils/feeRecordPdf";
import { scanTimeoutSeconds } from "../../utils/scanConstants";
import { colors } from "../../theme/colors";

export default function FeeCheckTab() {
  const { showToast } = useToast();
  const [scanOpen, setScanOpen] = useState(false);
  const [typedBarcode, setTypedBarcode] = useState("");
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
    <>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="qr-code" size={32} color={colors.primary} />
          </View>
          <FeeSectionHeader
            title="Scan Student ID"
            subtitle="Scan the QR code on the student's ID card to instantly view their full fee history, balances, and payment status."
          />
          <PrimaryButton title="Scan Fee" onPress={() => setScanOpen(true)} fullWidth />
          <TextField
            label="Or type barcode"
            value={typedBarcode}
            onChangeText={setTypedBarcode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Number on the ID card"
            returnKeyType="done"
            onSubmitEditing={() => {
              const code = typedBarcode.trim();
              if (!code || loading) return;
              setTypedBarcode("");
              void loadByBarcode(code);
            }}
          />
          <PrimaryButton
            title="Look up typed barcode"
            variant="secondary"
            disabled={loading || !typedBarcode.trim()}
            fullWidth
            onPress={() => {
              const code = typedBarcode.trim();
              if (!code || loading) return;
              setTypedBarcode("");
              void loadByBarcode(code);
            }}
          />
        </View>

        {loading ? (
          <Text style={styles.loading}>Loading fee record…</Text>
        ) : record ? (
          <View style={styles.recordWrap}>
            <FeeRecordView record={record} onPrint={handlePrint} printBusy={printBusy} />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="scan-outline" size={36} color={colors.textMuted} />
            <Text style={styles.placeholderText}>No fee record loaded yet.</Text>
            <Text style={styles.placeholderSub}>
              Scan the ID card or type the barcode above.
            </Text>
          </View>
        )}
      </ScrollView>

      <QrScanModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={loadByBarcode}
        onTimeout={() => {
          setScanOpen(false);
          showToast(`No QR code detected in ${scanTimeoutSeconds()} seconds. Try again.`, "err");
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120, gap: 16 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    gap: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: { textAlign: "center", color: colors.textMuted, padding: 20, fontWeight: "600" },
  recordWrap: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  placeholder: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  placeholderText: { fontSize: 15, fontWeight: "800", color: colors.text, textAlign: "center" },
  placeholderSub: { fontSize: 13, color: colors.textMuted, fontWeight: "600", textAlign: "center" },
});
