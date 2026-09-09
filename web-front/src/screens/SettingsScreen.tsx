import { useCallback, useEffect, useState } from "react";
import PrimaryButton from "../components/PrimaryButton";
import SegmentTabs from "../components/SegmentTabs";
import SelectField from "../components/SelectField";
import TextField from "../components/TextField";
import TimePickerField from "../components/TimePickerField";
import ToggleField from "../components/ToggleField";
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
import { formatTime12Display } from "../utils/dateTime";
import { emptyTemplates, normalizeTemplateMeta } from "../utils/messageTemplates";
import MessageFormatEditor from "./MessageFormatEditor";
import SettingsTab from "./academics/SettingsTab";
import "../styles/pagePanel.css";
import "./SettingsScreen.css";

const TABS = [
  { id: "school" as const, label: "School" },
  { id: "notifications" as const, label: "Notifications" },
  { id: "attendance" as const, label: "Check-in / out" },
  { id: "reminders" as const, label: "Reminders" },
];

const FREQUENCY_OPTIONS = [
  {
    value: "2",
    label: "Twice per day — check-in miss SMS, then a checkout SMS or checkout-miss SMS",
  },
  {
    value: "1",
    label: "Once per day — one summary SMS at the checkout reminder",
  },
];

function settingsBase(settings: SettingsData) {
  return {
    schoolName: settings.schoolName,
    schoolStartTime: settings.schoolStartTime,
    schoolEndTime: settings.schoolEndTime,
  };
}

export default function SettingsScreen() {
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
  const { data: settings, loading, error, reload } = useCachedQuery<SettingsData>(
    settingsLoader,
    {
      cacheKey: "settings",
      maxAgeMs: 0,
    }
  );

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
      const messagesPerDay: 1 | 2 = guardianMessagesPerDay === "1" ? 1 : 2;
      const saved = await updateSettings({
        ...settingsBase(settings),
        notifySmsEnabled,
        notifySmsNormal,
        notifyAppEnabled,
        schoolWeekDays,
        guardianMessagesPerDay: messagesPerDay,
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
      showToast("Check-in grace must be between 0 and 1440 minutes.", "err");
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
      showToast("Check-in and check-out rules saved.");
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
      showToast("Check-in reminder must be between 0 and 1440 minutes.", "err");
      return;
    }
    if (!Number.isFinite(checkoutMins) || checkoutMins < 0 || checkoutMins > 1440) {
      showToast("Check-out reminder must be between 0 and 1440 minutes.", "err");
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

  return (
    <div className="page-panel">
      <div className="page-panel__inner settings-screen">
        {!loading && settings && !settings.activeYear ? (
          <div className="settings-banner settings-banner--warn">
            Activate an academic year before changing settings.
          </div>
        ) : null}
        {!loading && settings?.activeYear ? (
          <div className="settings-banner settings-banner--info">
            Active year: <strong>{settings.activeYear.name}</strong>
            {" · "}
            School hours: {formatTime12Display(settings.schoolStartTime)}–{formatTime12Display(settings.schoolEndTime)}
            {" "}
            <span className="settings-screen__hours-hint">(Academics → Settings)</span>
          </div>
        ) : null}

        {error ? (
          <div className="settings-banner settings-banner--warn">{error}</div>
        ) : null}

        <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />

        <div className="settings-screen__panel">
          {tab === "school" ? <SettingsTab hideYearBanner /> : null}

          {tab === "notifications" ? (
            <section className="ui-card settings-screen__card">
              <h2 className="ui-card__title">Guardian notifications</h2>
              <p className="settings-screen__lead">
                SMS and the parent mobile app are separate channels. Turn on each one you want.
                Send SMS uses the guardian phone on the student record. Send Mobile App Notification
                uses linked parent accounts in the app inbox — not SMS credit.
              </p>

              {loading && !formReady ? (
                <p className="settings-screen__lead">Loading saved settings…</p>
              ) : (
                <div className="settings-screen__form">
                  <div className="settings-screen__toggles">
                    <ToggleField
                      label="Send SMS to guardians"
                      hint="Completers get one pair-summary SMS at the second checkout in a pair. Missers follow the frequency below. Does not change parent-app alerts."
                      checked={notifySmsEnabled}
                      onChange={(v) => {
                        setNotifySmsEnabled(v);
                        if (!v) setNotifySmsNormal(false);
                      }}
                    />
                    <ToggleField
                      label="Normal SMS Sending"
                      hint="When on, each check-in, check-out, and miss SMS goes out as it happens. Pair wait and once/twice batching are not used. Requires Send SMS."
                      checked={notifySmsNormal}
                      onChange={(v) => {
                        setNotifySmsNormal(v);
                        if (v) setNotifySmsEnabled(true);
                      }}
                    />
                    <ToggleField
                      label="Send Mobile App Notification"
                      hint="Linked parents get check-in, check-out, and miss alerts immediately in the app inbox and lock screen. Not delayed for pair completion or once/twice SMS timing."
                      checked={notifyAppEnabled}
                      onChange={setNotifyAppEnabled}
                    />
                  </div>

                  <p className="settings-chips-label">School days</p>
                  <div className="settings-chips" role="group" aria-label="School days">
                    {SCHOOL_WEEKDAY_CHIPS.map((day) => {
                      const on = schoolWeekDays.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          className={`settings-chip${on ? " settings-chip--on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggleSchoolDay(day.id)}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="settings-pairs-preview">
                    {previewPairPattern(schoolWeekDays) || "Tick at least one school day."}
                  </p>
                  <p className="settings-screen__field-hint">
                    Tick every day the school is in session. Consecutive school dates become pairs
                    (a single ticked day pairs with the next occurrence).
                  </p>

                  <SelectField
                    label="SMS for students who miss a check"
                    value={guardianMessagesPerDay}
                    options={FREQUENCY_OPTIONS}
                    withEmptyOption={false}
                    onChange={setGuardianMessagesPerDay}
                  />
                  <p className="settings-screen__field-hint">
                    Ignored while Normal SMS Sending is on. Otherwise — twice: check-in miss SMS at
                    the check-in reminder; if they later check out they get a checkout SMS, or a
                    checkout-miss SMS if they never check out. Never checked in: check-in miss SMS
                    only. Once: one summary at the checkout reminder showing check-in and/or
                    checkout miss times. Completers always get one pair-summary SMS after two
                    complete school days.
                  </p>

                  <MessageFormatEditor
                    templates={guardianMessageTemplates}
                    onChange={setGuardianMessageTemplates}
                    schoolName={settings?.schoolName || "Izzy Tech Team School"}
                    meta={settings?.messageTemplateMeta ?? normalizeTemplateMeta(undefined)}
                  />

                  <div className="settings-screen__actions">
                    <PrimaryButton
                      title={busy ? "Saving…" : "Save notification settings"}
                      loading={busy}
                      fullWidth
                      onClick={handleSaveNotifications}
                    />
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {tab === "attendance" ? (
            <section className="ui-card settings-screen__card">
              <h2 className="ui-card__title">Check-in &amp; check-out windows</h2>
              <p className="settings-screen__lead">
                These rules apply when scanning barcodes. Class-specific hours still apply per student
                when configured under Academics.
              </p>

              {loading && !formReady ? (
                <p className="settings-screen__lead">Loading saved settings…</p>
              ) : (
                <div className="settings-screen__form settings-screen__form--wide">
                  <TimePickerField
                    label="Check-in opens at"
                    value={checkInOpensAt}
                    onChange={setCheckInOpensAt}
                  />
                  <p className="settings-screen__field-hint">
                    Time when the check-in scan button becomes active (Cameroon time). Usually
                    matches school start ({formatTime12Display(settings?.schoolStartTime || "07:30")}).
                  </p>

                  <TextField
                    label="Check-in closes (minutes after school start)"
                    type="number"
                    min={0}
                    max={1440}
                    inputMode="numeric"
                    value={checkInGraceMinutes}
                    onChange={(e) => setCheckInGraceMinutes(e.target.value)}
                  />
                  <p className="settings-screen__field-hint">
                    Example: 60 allows check-in from the open time until 60 minutes after school start.
                  </p>

                  <div className="settings-screen__toggles">
                    <ToggleField
                      label="Allow check-out before school end time"
                      hint="When off, check-out scans are only accepted from school end time onward."
                      checked={allowCheckoutBeforeEnd}
                      onChange={setAllowCheckoutBeforeEnd}
                    />
                  </div>

                  <div className="settings-screen__actions">
                    <PrimaryButton
                      title={busy ? "Saving…" : "Save check-in / check-out rules"}
                      loading={busy}
                      fullWidth
                      onClick={handleSaveAttendance}
                    />
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {tab === "reminders" ? (
            <section className="ui-card settings-screen__card">
              <h2 className="ui-card__title">Automatic guardian reminders</h2>
              <p className="settings-screen__lead">
                These times control when a miss is detected. Parent-app alerts fire at each time
                immediately. With Normal SMS Sending on, miss SMS fire at these same times. Otherwise
                SMS follows once/twice: twice sends at each miss; once sends one summary at the
                checkout reminder.
              </p>

              {loading && !formReady ? (
                <p className="settings-screen__lead">Loading saved settings…</p>
              ) : (
                <div className="settings-screen__form settings-screen__form--wide">
                  <TextField
                    label="Missed check-in reminder (minutes after school start)"
                    type="number"
                    min={0}
                    max={1440}
                    inputMode="numeric"
                    value={absentCheckinReminderMinutes}
                    onChange={(e) => setAbsentCheckinReminderMinutes(e.target.value)}
                  />
                  <p className="settings-screen__field-hint">
                    If no check-in is recorded by this time: twice-per-day SMS sends a check-in miss
                    SMS; the parent app always alerts immediately. Once-per-day SMS waits for the
                    checkout reminder and includes this miss in the summary.
                  </p>

                  <TextField
                    label="Missed check-out summary (minutes after school end)"
                    type="number"
                    min={0}
                    max={1440}
                    inputMode="numeric"
                    value={missedCheckoutReminderMinutes}
                    onChange={(e) => setMissedCheckoutReminderMinutes(e.target.value)}
                  />
                  <p className="settings-screen__field-hint">
                    Once-per-day SMS sends the daily miss summary at this time. Twice-per-day SMS
                    sends a checkout-miss SMS here if they checked in but never out. Parent-app miss
                    alerts also fire at this time.
                  </p>

                  <div className="settings-screen__preview">
                    <p className="settings-screen__preview-title">Sample messages</p>
                    <p className="settings-screen__preview-text">
                      Completer pair summary: &ldquo;Greetings, Guardian, Your Child [Name], 12/08 in
                      7:45 AM out 3:30 PM; 13/08 in 7:50 AM out 3:28 PM. Full attendance. MPASAT&rdquo;
                    </p>
                    <p className="settings-screen__preview-text">
                      Check-in miss: &ldquo;Greetings, Guardian, Your Child [Name], no check-in 12/08.
                      Marked absent. MPASAT&rdquo;
                    </p>
                    <p className="settings-screen__preview-text">
                      Misser checkout: &ldquo;Greetings, Guardian, Your Child [Name], checked out at
                      3:30 PM on 12/08. MPASAT&rdquo;
                    </p>
                    <p className="settings-screen__preview-text">
                      Checkout miss: &ldquo;Greetings, Guardian, Your Child [Name], on 12/08 in
                      7:45 AM, no check-out. Incomplete day. MPASAT&rdquo;
                    </p>
                    <p className="settings-screen__preview-text">
                      Once-per-day summary: &ldquo;Greetings, Guardian, Your Child [Name], 12/08 no
                      check-in (by 8:30 AM); no check-out (by 4:30 PM). MPASAT&rdquo;
                    </p>
                    <p className="settings-screen__preview-text">
                      Custom wording is edited under Notifications → Message format. Blank fields keep
                      this built-in SMS text.
                    </p>
                  </div>

                  <div className="settings-screen__actions">
                    <PrimaryButton
                      title={busy ? "Saving…" : "Save reminder settings"}
                      loading={busy}
                      fullWidth
                      onClick={handleSaveReminders}
                    />
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
