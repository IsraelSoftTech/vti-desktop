import "./IconButton.css";

type Props = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "danger";
};

export default function IconButton({ label, onClick, variant = "primary" }: Props) {
  return (
    <button
      type="button"
      className={`icon-btn${variant === "danger" ? " icon-btn--danger" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
