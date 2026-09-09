import { useCallback, useEffect, useState } from "react";
import { getDesktopSyncStatus, uploadDesktopChanges } from "../api/desktop";
import { peekDesktopSessionPassword } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import "./SyncStatus.css";

export default function SyncStatus() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const detect = useCallback(async () => {
    const next = await getDesktopSyncStatus();
    setVisible(Boolean(next?.desktop));
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  if (!visible) return null;

  async function handleUpload() {
    if (busy) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      showToast("No internet connection. Changes stay on this PC.", "err");
      return;
    }
    setBusy(true);
    try {
      const result = await uploadDesktopChanges({
        username: user?.username,
        password: peekDesktopSessionPassword() || undefined,
      });
      const leftover = Number(result.pending || 0);
      if (leftover > 0 || result.state === "error") {
        showToast(result.message || "Upload incomplete — some records were not saved online", "err");
      } else {
        showToast(result.message || "Uploaded to the school server");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="sync-updates-btn"
      disabled={busy}
      onClick={() => void handleUpload()}
    >
      {busy ? "Uploading…" : "Upload Online"}
    </button>
  );
}
