import { useId, useState, type InputHTMLAttributes } from "react";
import "./TextField.css";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  secureToggle?: boolean;
};

export default function TextField({
  label,
  secureToggle,
  type,
  id: idProp,
  ...props
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [hidden, setHidden] = useState(true);

  const inputType = secureToggle ? (hidden ? "password" : "text") : type;

  return (
    <div className="text-field">
      <label className="text-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="text-field__row">
        <input
          {...props}
          id={id}
          type={inputType}
          className={`text-field__input${secureToggle ? " text-field__input--toggle" : ""}`}
        />
        {secureToggle ? (
          <button
            type="button"
            className="text-field__toggle"
            aria-label={hidden ? "Show password" : "Hide password"}
            onClick={() => setHidden((v) => !v)}
          >
            {hidden ? "Show" : "Hide"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
