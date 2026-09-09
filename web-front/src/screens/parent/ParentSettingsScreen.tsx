import { useState } from "react";
import Icon from "../../components/Icon";
import ConfirmModal from "../../components/ConfirmModal";
import { deleteParentAccount } from "../../api/parent";
import { privacyPolicyUrl, accountDeletionUrl } from "../../api/config";
import { useAuth } from "../../context/AuthContext";
import "./parentScreens.css";

export default function ParentSettingsScreen() {
  const { logout } = useAuth();
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await deleteParentAccount();
      setConfirmDelete(false);
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="parent-page">
      <div className="parent-page__inner">
        <h2 className="parent-settings__section">Legal</h2>
        <a
          className="parent-settings__row"
          href={privacyPolicyUrl()}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="document-text-outline" size={20} />
          Privacy Policy
        </a>
        <a
          className="parent-settings__row"
          href={accountDeletionUrl()}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="trash-bin-outline" size={20} />
          Request data deletion
        </a>

        <h2 className="parent-settings__section">Account</h2>
        <button
          type="button"
          className="parent-settings__row parent-settings__row--danger"
          onClick={() => setConfirmDelete(true)}
        >
          <Icon name="trash-outline" size={20} />
          Delete account
        </button>
        <p className="parent-settings__hint">
          Removes your parent login, chat, and linked-student connections. School attendance and fee
          records are kept by the school.
        </p>
        {error ? <p className="parent-note--owing">{error}</p> : null}
      </div>

      <ConfirmModal
        visible={confirmDelete}
        title="Delete your parent account?"
        message="This cannot be undone. Your login, chat, and student links will be removed. Student records at the school stay with the school."
        confirmLabel={deleting ? "Deleting…" : "Delete account"}
        onCancel={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        onConfirm={() => {
          if (!deleting) void handleDelete();
        }}
      />
    </div>
  );
}
