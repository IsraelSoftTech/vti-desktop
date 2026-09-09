import "./ToggleField.css";

type Props = {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export default function ToggleField({ label, hint, checked, onChange, disabled }: Props) {
  return (
    <label className="toggle-field">
      <span className="toggle-field__text">
        <span className="toggle-field__label">{label}</span>
        {hint ? <span className="toggle-field__hint">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className="toggle-field__input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
