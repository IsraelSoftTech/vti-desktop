import type { ButtonHTMLAttributes } from "react";
import "./PrimaryButton.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  loading?: boolean;
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
};

export default function PrimaryButton({
  title,
  loading,
  variant = "primary",
  disabled,
  fullWidth,
  className = "",
  ...props
}: Props) {
  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={[
        "primary-btn",
        isPrimary ? "primary-btn--primary" : "primary-btn--secondary",
        fullWidth ? "primary-btn--full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? (
        <span className="primary-btn__spinner" aria-hidden />
      ) : (
        title
      )}
    </button>
  );
}
