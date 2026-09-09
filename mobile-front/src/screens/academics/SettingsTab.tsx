import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import TimePickerField from "../../components/TimePickerField";
import SelectField from "../../components/SelectField";
import { getClasses, getSettings, updateClass, updateSettings, type SchoolClass, type SettingsData } from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { PHOTO_SIZE_TOO_LARGE } from "../../utils/studentPhoto";
import { prepareSchoolLogoFromAsset } from "../../utils/schoolLogo";
import { apiBaseUrl } from "../../api/config";
import { colors } from "../../theme/colors";

function resolveMediaUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  const base = apiBaseUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export default function SettingsTab() {
  const { showToast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("07:30");
  const [endTime, setEndTime] = useState("15:30");
  const [schoolName, setSchoolName] = useState("Izzy Tech Team School");
  const [logoPreview, setLogoPreview] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const settingsLoader = useCallback(() => getSettings(), []);
  const classesLoader = useCallback(() => getClasses(), []);
  const { data: settings, reload: reloadSettings } = useCachedQuery<SettingsData>(settingsLoader, { cacheKey: "settings", maxAgeMs: 30_000 });
  const { data: classes, reload: reloadClasses } = useCachedQuery<SchoolClass[]>(classesLoader, { cacheKey: "classes", maxAgeMs: 30_000 });

  useEffect(() => {
    if (!settings) return;
    setSchoolName(settings.schoolName);
    setStartTime(settings.schoolStartTime || "07:30");
    setEndTime(settings.schoolEndTime || "15:30");
    setLogoPreview(settings.schoolLogoUrl ? resolveMediaUrl(settings.schoolLogoUrl) : "");
    setLogoDataUrl("");
    setRemoveLogo(false);
  }, [settings]);

  useEffect(() => {
    if (!settings) return;
    if (selectedClassId == null) {
      setStartTime(settings.schoolStartTime || "07:30");
      setEndTime(settings.schoolEndTime || "15:30");
      return;
    }
    if (!classes?.length) return;
    const picked = classes.find((c) => c.id === selectedClassId);
    if (!picked) return;
    setStartTime(picked.schoolStartTime || settings.schoolStartTime || "07:30");
    setEndTime(picked.schoolEndTime || settings.schoolEndTime || "15:30");
  }, [selectedClassId, classes, settings]);

  const classSelectOptions = useMemo(
    () => [
      { label: "All classes (default times)", value: "" },
      ...(classes?.map((c) => ({ label: c.name, value: String(c.id) })) ?? []),
    ],
    [classes]
  );

  async function pickLogo() {
    setLogoBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const dataUrl = prepareSchoolLogoFromAsset(res.assets[0]);
      setLogoDataUrl(dataUrl);
      setLogoPreview(dataUrl);
      setRemoveLogo(false);
      showToast("Logo ready — tap Save settings to apply.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : PHOTO_SIZE_TOO_LARGE, "err");
    } finally {
      setLogoBusy(false);
    }
  }

  function clearLogo() {
    setLogoDataUrl("");
    setLogoPreview("");
    setRemoveLogo(true);
  }

  async function handleSave() {
    if (!settings?.activeYear) {
      showToast("Activate an academic year first.", "err");
      return;
    }
    setBusy(true);
    try {
      await updateSettings({
        schoolName: schoolName.trim(),
        schoolStartTime: startTime,
        schoolEndTime: endTime,
        ...(logoDataUrl ? { schoolLogoDataUrl: logoDataUrl } : {}),
        ...(removeLogo ? { removeSchoolLogo: true } : {}),
      });
      if (selectedClassId) {
        await updateClass(selectedClassId, { schoolStartTime: startTime, schoolEndTime: endTime });
      }
      clearCache("settings");
      clearCache("classes");
      void reloadSettings();
      void reloadClasses();
      showToast("School settings saved successfully.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save settings", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {!settings?.activeYear ? (
        <View style={styles.warn}><Text style={styles.warnText}>Activate an academic year before configuring settings.</Text></View>
      ) : (
        <View style={styles.info}><Text style={styles.infoText}>Active year: <Text style={styles.strong}>{settings.activeYear.name}</Text></Text></View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>School settings</Text>
        <View style={styles.form}>
          <TextField label="School name" value={schoolName} onChangeText={setSchoolName} />
          <View style={styles.logoField}>
            <Text style={styles.logoLabel}>School logo</Text>
            <Text style={styles.logoHint}>Shown on ID cards and reports. Max 2 MB.</Text>
            <View style={styles.logoRow}>
              {logoPreview ? (
                <Image source={{ uri: logoPreview }} style={styles.logoPreview} />
              ) : (
                <View style={styles.logoPlaceholder}><Text style={styles.logoPlaceholderText}>No logo</Text></View>
              )}
              <View style={styles.logoActions}>
                <Pressable style={styles.logoBtn} disabled={logoBusy || busy} onPress={pickLogo}>
                  <Text style={styles.logoBtnText}>{logoBusy ? "Processing…" : logoPreview ? "Change logo" : "Upload logo"}</Text>
                </Pressable>
                {logoPreview ? (
                  <Pressable style={[styles.logoBtn, styles.logoBtnMuted]} disabled={busy} onPress={clearLogo}>
                    <Text style={styles.logoBtnTextMuted}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
          <SelectField
            label="Select class (optional)"
            value={selectedClassId != null ? String(selectedClassId) : ""}
            options={classSelectOptions}
            placeholder="All classes (default times)"
            onChange={(v) => setSelectedClassId(v ? Number(v) : null)}
          />
          <TimePickerField label="School start time" value={startTime} onChange={setStartTime} />
          <TimePickerField label="School closing time" value={endTime} onChange={setEndTime} />
          <PrimaryButton title={busy ? "Saving…" : "Save settings"} loading={busy} onPress={handleSave} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24, gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 14, elevation: 3 },
  title: { fontSize: 16, fontWeight: "800", color: colors.primaryDark, marginBottom: 12 },
  form: { gap: 12 },
  warn: { backgroundColor: colors.accentPeachSoft, borderRadius: 16, padding: 14 },
  warnText: { color: "#c45a20", fontWeight: "600" },
  info: { backgroundColor: colors.primarySoft, borderRadius: 16, padding: 14 },
  infoText: { color: colors.textMuted },
  strong: { color: colors.primary, fontWeight: "800" },
  logoField: { gap: 6 },
  logoLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  logoHint: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  logoRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 4 },
  logoPreview: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(26,83,255,0.18)" },
  logoPlaceholder: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(100,116,139,0.45)", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" },
  logoPlaceholderText: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textAlign: "center" },
  logoActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  logoBtn: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: "rgba(26,83,255,0.35)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  logoBtnMuted: { backgroundColor: "#fff", borderColor: "rgba(100,116,139,0.35)" },
  logoBtnText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  logoBtnTextMuted: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
});
