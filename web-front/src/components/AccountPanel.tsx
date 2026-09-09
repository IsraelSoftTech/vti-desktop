import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import TextField from "./TextField";
import PrimaryButton from "./PrimaryButton";
import { changePassword, isAccountant, isParent, validateChangePasswordForm } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import "./AccountPanel.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

const emptyForm = (username = "") => ({
  username,
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

export default function AccountPanel({ open, onClose }: Props) {
  const { user, logout, refreshUser } = useAuth();
  const { showToast } = useToast();
  const accountant = isAccountant(user);
  const parent = isParent(user);
  const roleLabel = parent ? "Parent" : accountant ? "Accountant" : "Administrator";
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(user?.username || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setFormOpen(false);
    setForm(emptyForm(user?.username || ""));
    setBusy(false);
    setError("");
  }, [open, user?.username]);

  if (!open) return null;

  function toggleForm() {
    setFormOpen((openNow) => {
      if (openNow) {
        setForm(emptyForm(user?.username || ""));
        setError("");
      }
      return !openNow;
    });
  }

  async function handleLogout() {
    onClose();
    await logout();
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const err = validateChangePasswordForm({
      ...form,
      currentUsername: user?.username,
      allowUsernameChange: accountant,
    });
    if (err) {
      setError(err);
      showToast(err, "err");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await changePassword(
        accountant
          ? {
              currentPassword: form.currentPassword,
              newPassword: form.newPassword,
              confirmPassword: form.confirmPassword,
              username: form.username.trim(),
            }
          : {
              currentPassword: form.currentPassword,
              newPassword: form.newPassword,
              confirmPassword: form.confirmPassword,
            }
      );
      await refreshUser();
      setForm(emptyForm(user?.username || ""));
      setFormOpen(false);
      showToast(accountant ? "Account updated." : "Password changed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to change password";
      setError(message);
      showToast(message, "err");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="account-panel"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={`account-panel__card${formOpen ? " account-panel__card--form" : ""}`}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="account-panel__name">{user?.fullName || user?.username}</p>
        <p className="account-panel__meta">
          @{user?.username} · {roleLabel}
        </p>

        {!parent ? (
          <button
            type="button"
            className={`account-panel__action${formOpen ? " account-panel__action--active" : ""}`}
            aria-expanded={formOpen}
            onClick={toggleForm}
          >
            <Icon name="lock-closed-outline" size={18} />
            {accountant ? "Change credentials" : "Change password"}
          </button>
        ) : null}

        {formOpen && !parent ? (
          <form className="account-panel__form" onSubmit={(e) => void handleSave(e)}>
            {accountant ? (
              <TextField
                label="Username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                autoComplete="username"
                autoFocus
              />
            ) : null}
            <TextField
              label="Current password"
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
              secureToggle
              autoComplete="current-password"
              autoFocus={!accountant}
            />
            <TextField
              label="New password"
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
              secureToggle
              autoComplete="new-password"
            />
            <TextField
              label="Confirm new password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              secureToggle
              autoComplete="new-password"
            />
            {error ? <p className="account-panel__error">{error}</p> : null}
            <PrimaryButton
              type="submit"
              title={busy ? "Saving…" : "Save"}
              loading={busy}
              fullWidth
            />
          </form>
        ) : null}

        <button type="button" className="account-panel__logout" onClick={() => void handleLogout()}>
          <Icon name="log-out-outline" size={18} />
          Logout
        </button>
      </div>
    </div>,
    document.body
  );
}
