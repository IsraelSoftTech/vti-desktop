import { formatDateDisplay } from "../utils/dateTime";
import "./DatePickerField.css";

type Props = {
  label: string;
  value?: string | null;
  onChange: (iso: string) => void;
};

export default function DatePickerField({ label, value, onChange }: Props) {
  return (
    <div className="date-field">
      <label className="date-field__label" htmlFor={`date-${label}`}>
        {label}
      </label>
      <input
        id={`date-${label}`}
        type="date"
        className="date-field__input"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        title={value ? formatDateDisplay(value) : "Select date"}
      />
    </div>
  );
}
