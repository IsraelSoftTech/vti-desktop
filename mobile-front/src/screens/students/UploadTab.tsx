import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import PrimaryButton from "../../components/PrimaryButton";
import { bulkUploadStudents, type BulkUploadResult } from "../../api/students";
import { apiBaseUrl } from "../../api/config";
import { useToast } from "../../context/ToastContext";
import { clearCache } from "../../utils/cache";
import { colors } from "../../theme/colors";
import { useState } from "react";

const TEMPLATE_COLUMNS = [
  "Full Name",
  "Sex",
  "Date of Birth",
  "Place of Birth",
  "Guardian's Name",
  "Contact",
  "Class",
  "ID Card Photo (optional)",
];

export default function UploadTab() {
  const { showToast } = useToast();
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  function invalidate() {
    clearCache("students");
    clearCache("dashboard");
  }

  async function pickFile() {
    setResult(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    if (!asset.name.toLowerCase().endsWith(".xlsx")) {
      showToast("Please select an .xlsx Excel file.", "err");
      return;
    }
    setFile(asset);
  }

  async function handleUpload() {
    if (!file?.uri) {
      showToast("Select an Excel file first.", "err");
      return;
    }
    setBusy(true);
    try {
      const data = await bulkUploadStudents(file.uri, file.name);
      setResult(data);
      invalidate();
      if (data.failed === 0) {
        showToast(`${data.registered} student(s) registered successfully.`);
      } else if (data.registered > 0) {
        showToast(`${data.registered} registered, ${data.failed} failed.`, "err");
      } else {
        showToast("No students were registered. Check the errors below.", "err");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.title}>Bulk upload students</Text>
        <Text style={styles.sub}>
          Upload an Excel (.xlsx) file using the template below. Each row is registered in the
          class named in the Class column — the name must match a class in the system exactly.
          ID Card Photo is optional; place the actual picture in the Excel cell (not a link).
        </Text>

        <View style={styles.templateBox}>
          <Text style={styles.templateTitle}>Template columns (row 2)</Text>
          {TEMPLATE_COLUMNS.map((col) => (
            <View key={col} style={styles.templateRow}>
              <View style={styles.templateDot} />
              <Text style={styles.templateText}>{col}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.apiHint}>API: {apiBaseUrl()}</Text>

        <View style={styles.fileRow}>
          <Ionicons name="document-text-outline" size={22} color={colors.primary} />
          <Text style={styles.fileName} numberOfLines={2}>
            {file ? file.name : "No file selected"}
          </Text>
        </View>

        <View style={styles.actions}>
          <PrimaryButton title="Choose Excel file" variant="secondary" onPress={pickFile} />
          <PrimaryButton
            title={busy ? "Uploading…" : "Upload & register"}
            loading={busy}
            onPress={handleUpload}
            disabled={!file}
          />
        </View>
      </View>

      {result ? (
        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>Upload results</Text>
          <Text style={styles.resultsSummary}>
            {result.registered} registered · {result.failed} failed · {result.total} total rows
          </Text>
          <View style={styles.resultsList}>
            {result.results.map((row) => (
              <View
                key={`${row.row}-${row.fullName}`}
                style={[styles.resultRow, row.ok ? styles.resultOk : styles.resultFail]}
              >
                <Ionicons
                  name={row.ok ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={row.ok ? colors.accentTeal : colors.danger}
                />
                <View style={styles.resultBody}>
                  <Text style={styles.resultName}>
                    Row {row.row}: {row.fullName || "(empty name)"}
                  </Text>
                  {row.ok ? (
                    <Text style={styles.resultMeta}>Registered successfully</Text>
                  ) : (
                    <Text style={styles.resultError}>{row.error}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 28 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.primaryDark, marginBottom: 6 },
  sub: { fontSize: 12, color: colors.textMuted, marginBottom: 14, lineHeight: 17 },
  templateBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 6,
  },
  templateTitle: { fontSize: 12, fontWeight: "800", color: colors.primaryDark, marginBottom: 4 },
  templateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  templateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  templateText: { fontSize: 12, color: colors.text, fontWeight: "600", flex: 1 },
  apiHint: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "600",
    marginBottom: 12,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  fileName: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
  actions: { gap: 10 },
  resultsCard: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  resultsTitle: { fontSize: 16, fontWeight: "800", color: colors.primaryDark },
  resultsSummary: { marginTop: 4, marginBottom: 12, fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  resultsList: { gap: 8 },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 12,
  },
  resultOk: { backgroundColor: colors.accentTealSoft },
  resultFail: { backgroundColor: colors.dangerSoft },
  resultBody: { flex: 1 },
  resultName: { fontSize: 13, fontWeight: "700", color: colors.text },
  resultMeta: { marginTop: 2, fontSize: 11, color: colors.accentTeal, fontWeight: "600" },
  resultError: { marginTop: 2, fontSize: 11, color: colors.danger, fontWeight: "600", lineHeight: 16 },
});
