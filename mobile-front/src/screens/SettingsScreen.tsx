import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View, Pressable } from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import SegmentTabs from "../components/SegmentTabs";
import SelectField from "../components/SelectField";
import TextField from "../components/TextField";
import TimePickerField from "../components/TimePickerField";
import ScreenLayout from "../components/ScreenLayout";
import {
  getSettings,
  normalizeSettingsData,
  updateSettings,
  type SettingsData,
} from "../api/academics";
import { useToast } from "../context/ToastContext";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { setCache } from "../utils/cache";
import { previewPairPattern, SCHOOL_WEEKDAY_CHIPS } from "../utils/schoolPairPreview";
import { colors } from "../theme/colors";
import { formatTime12Display } from "../utils/dateTime";
import { emptyTemplates, normalizeTemplateMeta } from "../utils/messageTemplates";
import MessageFormatEditor from "./MessageFormatEditor";

const TABS = [
  { id: "notifications" as const, label: "Notifications" },
  { id: "attendance" as const, label: "Check-in / out" },
  { id: "reminders" as const, label: "Reminders" },
];

const FREQUENCY_OPTIONS = [
  { value: "2", label: "Twice per day — check-in miss, then checkout or checkout-miss SMS" },
  { value: "1", label: "Once per day — one summary SMS at the checkout reminder" },
];

function NotifyToggle({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primarySoft }}
        thumbColor={value ? colors.primary : colors.white}
      />
    </View>
  );
}

function settingsBase(settings: SettingsData) {
  return {
    schoolName: settings.schoolName,
    schoolStartTime: settings.schoolStartTime,
    schoolEndTime: settings.schoolEndTime,
  };
}

type Props = {
  embedded?: boolean;
};

export default function SettingsScreen({ embedded }: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("notifications");
  const [notifySmsEnabled, setNotifySmsEnabled] = useState(true);
  const [notifySmsNormal, setNotifySmsNormal] = useState(false);
  const [notifyAppEnabled, setNotifyAppEnabled] = useState(false);
  const [schoolWeekDays, setSchoolWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [guardianMessagesPerDay, setGuardianMessagesPerDay] = useState("2");
  const [checkInOpensAt, setCheckInOpensAt] = useState("07:30");
  const [checkInGraceMinutes, setCheckInGraceMinutes] = useState("60");
  const [allowCheckoutBeforeEnd, setAllowCheckoutBeforeEnd] = useState(true);
  const [absentCheckinReminderMinutes, setAbsentCheckinReminderMinutes] = useState("60");
  const [missedCheckoutReminderMinutes, setMissedCheckoutReminderMinutes] = useState("60");
  const [guardianMessageTemplates, setGuardianMessageTemplates] = useState(emptyTemplates());
  const [formReady, setFormReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const settingsLoader = useCallback(() => getSettings(), []);
  const { data: settings, loading, error, reload } = useCachedQuery<SettingsData>(settingsLoader, {
    cacheKey: "settings",
    maxAgeMs: 0,
  });

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!settings) {
      setFormReady(false);
      return;
    }
    setNotifySmsEnabled(settings.notifySmsEnabled);
    setNotifySmsNormal(settings.notifySmsNormal);
    setNotifyAppEnabled(settings.notifyAppEnabled);
    setSchoolWeekDays(settings.schoolWeekDays?.length ? settings.schoolWeekDays : [1, 2, 3, 4, 5]);
    setGuardianMessagesPerDay(String(settings.guardianMessagesPerDay));
    setCheckInOpensAt(settings.checkInOpensAt || settings.schoolStartTime);
    setCheckInGraceMinutes(String(settings.checkInGraceMinutesAfterStart));
    setAllowCheckoutBeforeEnd(settings.allowCheckoutBeforeEndTime);
    setAbsentCheckinReminderMinutes(String(settings.absentCheckinReminderMinutes));
    setMissedCheckoutReminderMinutes(String(settings.missedCheckoutReminderMinutes));
    setGuardianMessageTemplates(settings.guardianMessageTemplates);
    setFormReady(true);
  }, [settings]);

  function applySaved(saved: SettingsData) {
    const normalized = normalizeSettingsData(saved);
    setCache("settings", normalized);
    setNotifySmsEnabled(normalized.notifySmsEnabled);
    setNotifySmsNormal(normalized.notifySmsNormal);
    setNotifyAppEnabled(normalized.notifyAppEnabled);
    setSchoolWeekDays(normalized.schoolWeekDays?.length ? normalized.schoolWeekDays : [1, 2, 3, 4, 5]);
    setGuardianMessagesPerDay(String(normalized.guardianMessagesPerDay));
    setCheckInOpensAt(normalized.checkInOpensAt);
    setCheckInGraceMinutes(String(normalized.checkInGraceMinutesAfterStart));
    setAllowCheckoutBeforeEnd(normalized.allowCheckoutBeforeEndTime);
    setAbsentCheckinReminderMinutes(String(normalized.absentCheckinReminderMinutes));
    setMissedCheckoutReminderMinutes(String(normalized.missedCheckoutReminderMinutes));
    setGuardianMessageTemplates(normalized.guardianMessageTemplates);
  }

  function toggleSchoolDay(id: number) {
    setSchoolWeekDays((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter((d) => d !== id).sort((a, b) => a - b);
      }
      return [...current, id].sort((a, b) => a - b);
    });
  }

  async function handleSaveNotifications() {
    if (!settings?.activeYear) {
      showToast("Activate an academic year first.", "err");
      return;
    }
    if (!schoolWeekDays.length) {
      showToast("Need at least one school day.", "err");
      return;
    }
    setBusy(true);
    try {
      const saved = await updateSettings({
        ...settingsBase(settings),
        notifySmsEnabled,
        notifySmsNormal,
        notifyAppEnabled,
        schoolWeekDays,
        guardianMessagesPerDay: guardianMessagesPerDay === "1" ? 1 : 2,
        guardianMessageTemplates,
      });
      applySaved(saved);
      showToast("Notification settings saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save settings", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAttendance() {
    if (!settings?.activeYear) {
      showToast("Activate an academic year first.", "err");
      return;
    }
    const grace = Number(checkInGraceMinutes);
    if (!Number.isFinite(grace) || grace < 0 || grace > 1440) {
      showToast("Check-in grace must be 0–1440 minutes.", "err");
      return;
    }
    setBusy(true);
    try {
      const saved = await updateSettings({
        ...settingsBase(settings),
        checkInOpensAt: checkInOpensAt || settings.schoolStartTime,
        checkInGraceMinutesAfterStart: Math.round(grace),
        allowCheckoutBeforeEndTime: allowCheckoutBeforeEnd,
      });
      applySaved(saved);
      showToast("Check-in / check-out rules saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save settings", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveReminders() {
    if (!settings?.activeYear) {
      showToast("Activate an academic year first.", "err");
      return;
    }
    const checkinMins = Number(absentCheckinReminderMinutes);
    const checkoutMins = Number(missedCheckoutReminderMinutes);
    if (!Number.isFinite(checkinMins) || checkinMins < 0 || checkinMins > 1440) {
      showToast("Check-in reminder must be 0–1440 minutes.", "err");
      return;
    }
    if (!Number.isFinite(checkoutMins) || checkoutMins < 0 || checkoutMins > 1440) {
      showToast("Check-out reminder must be 0–1440 minutes.", "err");
      return;
    }
    setBusy(true);
    try {
      const saved = await updateSettings({
        ...settingsBase(settings),
        absentCheckinReminderMinutes: Math.round(checkinMins),
        missedCheckoutReminderMinutes: Math.round(checkoutMins),
      });
      applySaved(saved);
      showToast("Reminder settings saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save settings", "err");
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {!loading && settings && !settings.activeYear ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>Activate an academic year before changing settings.</Text>
        </View>
      ) : null}
      {!loading && settings?.activeYear ? (
        <View style={styles.info}>
          <Text style={styles.infoText}>
            Active year: <Text style={styles.strong}>{settings.activeYear.name}</Text>
            {"\n"}
            School hours: {formatTime12Display(settings.schoolStartTime)}–{formatTime12Display(settings.schoolEndTime)} (Academics → Settings)
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{error}</Text>
        </View>
      ) : null}

      <SegmentTabs tabs={TABS} active={tab} onChange={setTab} equalWidth />

      {tab === "notifications" ? (
        <View style={[styles.card, styles.cardFlex]}>
          <Text style={styles.title}>Guardian notifications</Text>
          <Text style={styles.lead}>
            SMS and the parent mobile app are separate. Turn on each channel you want.
          </Text>
          {loading && !formReady ? (
            <Text style={styles.lead}>Loading saved settings…</Text>
          ) : (
            <>
              <NotifyToggle
                label="Send SMS to guardians"
                hint="Completers get one pair-summary SMS at the second checkout in a pair. Missers follow the frequency below. Does not change parent-app alerts."
                value={notifySmsEnabled}
                onValueChange={(v) => {
                  setNotifySmsEnabled(v);
                  if (!v) setNotifySmsNormal(false);
                }}
              />
              <NotifyToggle
                label="Normal SMS Sending"
                hint="Each check-in, check-out, and miss SMS goes out as it happens. Pair wait and once/twice batching are not used. Requires Send SMS."
                value={notifySmsNormal}
                onValueChange={(v) => {
                  setNotifySmsNormal(v);
                  if (v) setNotifySmsEnabled(true);
                }}
              />
              <NotifyToggle
                label="Send Mobile App Notification"
                hint="Check-in, check-out, and miss alerts go to linked parents immediately. Not delayed for pair completion or once/twice SMS timing."
                value={notifyAppEnabled}
                onValueChange={setNotifyAppEnabled}
              />
              <Text style={styles.chipsLabel}>School days</Text>
              <View style={styles.chips}>
                {SCHOOL_WEEKDAY_CHIPS.map((day) => {
                  const on = schoolWeekDays.includes(day.id);
                  return (
                    <Pressable
                      key={day.id}
                      onPress={() => toggleSchoolDay(day.id)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{day.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.pairsPreview}>
                {previewPairPattern(schoolWeekDays) || "Tick at least one school day."}
              </Text>
              <Text style={styles.fieldHint}>
                Tick every day the school is in session. Consecutive school dates become pairs.
              </Text>
              <SelectField
                label="SMS for students who miss a check"
                value={guardianMessagesPerDay}
                options={FREQUENCY_OPTIONS}
                placeholder="Select frequency"
                onChange={setGuardianMessagesPerDay}
              />
              <Text style={styles.fieldHint}>
                Ignored while Normal SMS Sending is on. Otherwise — twice: check-in miss SMS, then
                a checkout SMS if they check out or a checkout-miss SMS if they do not. Never
                checked in: check-in miss SMS only. Once: one summary at the checkout reminder.
                Completers always get one pair summary after two complete school days.
              </Text>
              <MessageFormatEditor
                templates={guardianMessageTemplates}
                onChange={setGuardianMessageTemplates}
                schoolName={settings?.schoolName || "Izzy Tech Team School"}
                meta={settings?.messageTemplateMeta ?? normalizeTemplateMeta(undefined)}
              />
              <View style={styles.actions}>
                <PrimaryButton
                  title={busy ? "Saving…" : "Save notification settings"}
                  loading={busy}
                  fullWidth
                  onPress={handleSaveNotifications}
                />
              </View>
            </>
          )}
        </View>
      ) : null}

      {tab === "attendance" ? (
        <View style={[styles.card, styles.cardFlex]}>
          <Text style={styles.title}>Check-in & check-out windows</Text>
          <Text style={styles.lead}>
            Applied when scanning barcodes. Per-class hours still apply when set.
          </Text>
          {loading && !formReady ? (
            <Text style={styles.lead}>Loading saved settings…</Text>
          ) : (
            <>
              <TimePickerField
                label="Check-in opens at"
                value={checkInOpensAt}
                onChange={setCheckInOpensAt}
              />
              <Text style={styles.fieldHint}>
                When the check-in scan becomes active (usually school start).
              </Text>
              <TextField
                label="Check-in closes (minutes after school start)"
                keyboardType="number-pad"
                value={checkInGraceMinutes}
                onChangeText={setCheckInGraceMinutes}
              />
              <Text style={styles.fieldHint}>
                Example: 60 allows check-in until 60 minutes after school start.
              </Text>
              <NotifyToggle
                label="Allow check-out before school end time"
                hint="When off, check-out is only accepted from school end onward."
                value={allowCheckoutBeforeEnd}
                onValueChange={setAllowCheckoutBeforeEnd}
              />
              <View style={styles.actions}>
                <PrimaryButton
                  title={busy ? "Saving…" : "Save check-in / check-out rules"}
                  loading={busy}
                  fullWidth
                  onPress={handleSaveAttendance}
                />
              </View>
            </>
          )}
        </View>
      ) : null}

      {tab === "reminders" ? (
        <View style={[styles.card, styles.cardFlex]}>
          <Text style={styles.title}>Automatic guardian reminders</Text>
          <Text style={styles.lead}>
            These times control when a miss is detected. Parent-app alerts fire immediately. With
            Normal SMS Sending on, miss SMS fire at these same times. Otherwise SMS follows
            once/twice.
          </Text>
          {loading && !formReady ? (
            <Text style={styles.lead}>Loading saved settings…</Text>
          ) : (
            <>
              <TextField
                label="Missed check-in reminder (minutes after school start)"
                keyboardType="number-pad"
                value={absentCheckinReminderMinutes}
                onChangeText={setAbsentCheckinReminderMinutes}
              />
              <Text style={styles.fieldHint}>
                If there is no check-in by this time: twice-per-day SMS sends a check-in miss SMS.
                The parent app always alerts immediately. Once-per-day SMS waits for the checkout
                reminder.
              </Text>
              <TextField
                label="Missed check-out summary (minutes after school end)"
                keyboardType="number-pad"
                value={missedCheckoutReminderMinutes}
                onChangeText={setMissedCheckoutReminderMinutes}
              />
              <Text style={styles.fieldHint}>
                Once-per-day SMS sends the miss summary here. Twice-per-day SMS sends a
                checkout-miss SMS if they checked in but never out. Parent-app miss alerts fire here
                too.
              </Text>
              <View style={styles.preview}>
                <Text style={styles.previewTitle}>Sample messages</Text>
                <Text style={styles.previewText}>
                  Completer pair summary: &quot;Greetings, Guardian, Your Child [Name], 12/08 in 7:45
                  AM out 3:30 PM; 13/08 in 7:50 AM out 3:28 PM. Full attendance. MPASAT&quot;
                </Text>
                <Text style={styles.previewText}>
                  Check-in miss: &quot;Greetings, Guardian, Your Child [Name], no check-in 12/08.
                  Marked absent. MPASAT&quot;
                </Text>
                <Text style={styles.previewText}>
                  Misser checkout: &quot;Greetings, Guardian, Your Child [Name], checked out at 3:30
                  PM on 12/08. MPASAT&quot;
                </Text>
                <Text style={styles.previewText}>
                  Checkout miss: &quot;Greetings, Guardian, Your Child [Name], on 12/08 in 7:45 AM,
                  no check-out. Incomplete day. MPASAT&quot;
                </Text>
                <Text style={styles.previewText}>
                  Once-per-day summary: &quot;Greetings, Guardian, Your Child [Name], 12/08 no
                  check-in (by 8:30 AM); no check-out (by 4:30 PM). MPASAT&quot;
                </Text>
                <Text style={styles.previewText}>
                  Custom wording is edited under Notifications → Message format. Blank fields keep
                  this built-in SMS text.
                </Text>
              </View>
              <View style={styles.actions}>
                <PrimaryButton
                  title={busy ? "Saving…" : "Save reminder settings"}
                  loading={busy}
                  fullWidth
                  onPress={handleSaveReminders}
                />
              </View>
            </>
          )}
        </View>
      ) : null}
    </ScrollView>
  );

  if (embedded) {
    return <View style={styles.embedded}>{body}</View>;
  }

  return <ScreenLayout>{body}</ScreenLayout>;
}

const styles = StyleSheet.create({
  embedded: { flex: 1, width: "100%" },
  scrollView: { flex: 1, width: "100%" },
  scroll: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    width: "100%",
  },
  warn: {
    backgroundColor: "#fff3cd",
    padding: 12,
    borderRadius: 8,
  },
  warnText: { color: "#856404", fontSize: 14 },
  info: {
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: 8,
  },
  infoText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: "700" },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    width: "100%",
    alignSelf: "stretch",
  },
  cardFlex: {
    flexGrow: 1,
    minHeight: 240,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  lead: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  fieldHint: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginTop: -4 },
  chipsLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  chipTextOn: { color: colors.white },
  pairsPreview: { fontSize: 13, fontWeight: "700", color: colors.text, lineHeight: 18 },
  preview: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  previewTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  previewText: { fontSize: 12, color: colors.textMuted, fontStyle: "italic", lineHeight: 18 },
  actions: {
    marginTop: "auto",
    paddingTop: 8,
    width: "100%",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  toggleText: { flex: 1, minWidth: 0 },
  toggleLabel: { fontSize: 16, fontWeight: "600", color: colors.text },
  toggleHint: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
});
