import PrimaryButton from "./PrimaryButton";
import "./ConfirmModal.css";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!visible) return null;

  return (
    <div className="confirm-modal" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        className="confirm-modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" className="confirm-modal__title">
          {title}
        </h2>
        <p className="confirm-modal__message">{message}</p>
        <div className="confirm-modal__actions">
          <PrimaryButton
            title="Cancel"
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={onCancel}
          />
          {danger ? (
            <button
              type="button"
              className="confirm-modal__danger"
              disabled={busy}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          ) : (
            <PrimaryButton
              title={confirmLabel}
              fullWidth
              loading={busy}
              onClick={onConfirm}
            />
          )}
        </div>
      </div>
    </div>
  );
}
