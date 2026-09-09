import "./SelectField.css";

type Option = { label: string; value: string };

type Props = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** When false, the select always has a valid option (no blank placeholder row). */
  withEmptyOption?: boolean;
};

export default function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Select an option",
  withEmptyOption = true,
}: Props) {
  return (
    <div className="select-field">
      <label className="select-field__label">{label}</label>
      <select
        className="select-field__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {withEmptyOption ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
