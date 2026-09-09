import { useCallback, useEffect, useMemo, useState } from "react";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import TimePickerField from "../../components/TimePickerField";
import SelectField from "../../components/SelectField";
import {
  getClasses,
  getSettings,
  updateClass,
  updateSettings,
  type SchoolClass,
  type SettingsData,
} from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { PHOTO_SIZE_TOO_LARGE } from "../../utils/studentPhoto";
import { prepareSchoolLogoFromFile } from "../../utils/schoolLogo";
import { applySiteBranding, resolveMediaUrl } from "../../utils/siteBranding";
import "../../styles/pagePanel.css";
import "./academicsTabs.css";

export default function SettingsTab({ hideYearBanner = false }: { hideYearBanner?: boolean }) {
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
  const { data: settings, reload: reloadSettings } = useCachedQuery<SettingsData>(
    settingsLoader,
    { cacheKey: "settings", maxAgeMs: 30_000 }
  );
  const { data: classes, reload: reloadClasses } = useCachedQuery<SchoolClass[]>(
    classesLoader,
    { cacheKey: "classes", maxAgeMs: 30_000 }
  );

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

  function pickLogo() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/svg+xml,image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setLogoBusy(true);
      prepareSchoolLogoFromFile(file)
        .then((dataUrl) => {
          setLogoDataUrl(dataUrl);
          setLogoPreview(dataUrl);
          setRemoveLogo(false);
          showToast("Logo ready — click Save settings to apply.");
        })
        .catch((e) => {
          showToast(e instanceof Error ? e.message : PHOTO_SIZE_TOO_LARGE, "err");
        })
        .finally(() => setLogoBusy(false));
    };
    input.click();
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
      const saved = await updateSettings({
        schoolName: schoolName.trim(),
        schoolStartTime: startTime,
        schoolEndTime: endTime,
        ...(logoDataUrl ? { schoolLogoDataUrl: logoDataUrl } : {}),
        ...(removeLogo ? { removeSchoolLogo: true } : {}),
      });
      if (selectedClassId) {
        await updateClass(selectedClassId, {
          schoolStartTime: startTime,
          schoolEndTime: endTime,
        });
      }
      clearCache("settings");
      clearCache("classes");
      void reloadSettings();
      void reloadClasses();
      applySiteBranding({
        schoolName: saved.schoolName,
        schoolLogoUrl: saved.schoolLogoUrl,
      });
      showToast("School settings saved successfully.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save settings", "err");
    } finally {
      setBusy(false);
    }
  }

  const classOptions = useMemo(
    () => classes?.map((c) => ({ label: c.name, value: String(c.id) })) ?? [],
    [classes]
  );

  return (
    <div className="academics-tab">
      {hideYearBanner ? null : !settings?.activeYear ? (
        <div className="academics-banner academics-banner--warn">
          Activate an academic year before configuring settings.
        </div>
      ) : (
        <div className="academics-banner academics-banner--info">
          Active year: <strong>{settings.activeYear.name}</strong>
        </div>
      )}

      <section className="ui-card">
        <h2 className="ui-card__title">School settings</h2>
        <div className="ui-form">
          <TextField
            label="School name"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
          <div className="school-logo-field">
            <span className="school-logo-field__label">School logo</span>
            <p className="school-logo-field__hint">Used in the browser tab (favicon).</p>
            <div className="school-logo-field__row">
              {logoPreview ? (
                <img src={logoPreview} alt="" className="school-logo-field__preview" />
              ) : (
                <div className="school-logo-field__placeholder">No logo</div>
              )}
              <div className="school-logo-field__actions">
                <button
                  type="button"
                  className="school-logo-field__btn"
                  disabled={logoBusy || busy}
                  onClick={pickLogo}
                >
                  {logoBusy ? "Processing…" : logoPreview ? "Change logo" : "Upload logo"}
                </button>
                {logoPreview ? (
                  <button
                    type="button"
                    className="school-logo-field__btn school-logo-field__btn--muted"
                    disabled={busy}
                    onClick={clearLogo}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <SelectField
            label="Select class (optional)"
            value={selectedClassId != null ? String(selectedClassId) : ""}
            options={classOptions}
            placeholder="All classes (default times)"
            onChange={(v) => setSelectedClassId(v ? Number(v) : null)}
          />
          <TimePickerField label="School start time" value={startTime} onChange={setStartTime} />
          <TimePickerField label="School closing time" value={endTime} onChange={setEndTime} />
          <PrimaryButton
            title={busy ? "Saving…" : "Save settings"}
            loading={busy}
            onClick={handleSave}
          />
        </div>
      </section>
    </div>
  );
}
