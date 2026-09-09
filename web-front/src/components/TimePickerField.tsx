import { useId, useState } from "react";
import {
  formatTime12Display,
  formatTime24From12,
  parseTime12Parts,
  type Time12Period,
} from "../utils/dateTime";
import "./DatePickerField.css";
import "./TimePickerField.css";

type Props = {
  label: string;
  value?: string | null;
  onChange: (time24: string) => void;
};

const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: Time12Period[] = ["AM", "PM"];

export default function TimePickerField({ label, value, onChange }: Props) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parseTime12Parts(value));

  function openPicker() {
    setDraft(parseTime12Parts(value));
    setOpen(true);
  }

  function confirm() {
    onChange(formatTime24From12(draft.hour12, draft.minutes, draft.period));
    setOpen(false);
  }

  return (
    <div className="date-field">
      <label className="date-field__label" htmlFor={triggerId}>
        {label}
      </label>
      <button
        id={triggerId}
        type="button"
        className="date-field__input time-field__trigger"
        onClick={openPicker}
      >
        {value ? formatTime12Display(value) : "Select time"}
      </button>

      {open ? (
        <div
          className="time-field__backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="time-field__sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="time-field__toolbar">
              <button type="button" className="time-field__toolbar-btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <span className="time-field__toolbar-title">{label}</span>
              <button type="button" className="time-field__toolbar-btn time-field__toolbar-btn--done" onClick={confirm}>
                Done
              </button>
            </div>
            <div className="time-field__pickers">
              <select
                className="time-field__select"
                aria-label="Hour"
                value={draft.hour12}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, hour12: Number(e.target.value) }))
                }
              >
                {HOURS12.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <select
                className="time-field__select"
                aria-label="Minute"
                value={draft.minutes}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, minutes: Number(e.target.value) }))
                }
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <select
                className="time-field__select time-field__select--period"
                aria-label="AM or PM"
                value={draft.period}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, period: e.target.value as Time12Period }))
                }
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
