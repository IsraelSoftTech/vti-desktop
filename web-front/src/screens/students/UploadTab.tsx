import { useState } from "react";
import PrimaryButton from "../../components/PrimaryButton";
import { bulkUploadStudents, type BulkUploadResult } from "../../api/students";
import { apiBaseUrl } from "../../api/config";
import { useToast } from "../../context/ToastContext";
import { clearCache } from "../../utils/cache";
import "../../styles/pagePanel.css";
import "./UploadTab.css";

const TEMPLATE_COLUMNS = [
  "Full Name",
  "Sex",
  "Date of Birth",
  "Place of Birth",
  "Guardian's Name",
  "Contact",
  "Class",
  "ID Card Photo (optional)",
];

export default function UploadTab() {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  function invalidate() {
    clearCache("students");
    clearCache("dashboard");
  }

  function pickFile() {
    setResult(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (!f.name.toLowerCase().endsWith(".xlsx")) {
        showToast("Please select an .xlsx Excel file.", "err");
        return;
      }
      setFile(f);
    };
    input.click();
  }

  async function handleUpload() {
    if (!file) {
      showToast("Select an Excel file first.", "err");
      return;
    }
    setBusy(true);
    try {
      const data = await bulkUploadStudents(file);
      setResult(data);
      invalidate();
      if (data.failed === 0) {
        showToast(`${data.registered} student(s) registered successfully.`);
      } else if (data.registered > 0) {
        showToast(`${data.registered} registered, ${data.failed} failed.`, "err");
      } else {
        showToast("No students were registered. Check the errors below.", "err");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-tab">
      <div className="ui-card">
        <h2 className="ui-card__title">Bulk upload students</h2>
        <p className="ui-card__sub">
          Upload an Excel (.xlsx) file using the template below. Each row is registered in the
          class named in the Class column — the name must match a class in the system exactly.
          ID Card Photo is optional; place the actual picture in the Excel cell (not a link).
        </p>

        <div className="upload-tab__template">
          <p className="upload-tab__template-title">Template columns (row 2)</p>
          {TEMPLATE_COLUMNS.map((col) => (
            <div key={col} className="upload-tab__template-row">
              <span className="upload-tab__dot" aria-hidden />
              <span>{col}</span>
            </div>
          ))}
        </div>

        <p className="upload-tab__api">API: {apiBaseUrl() || "(same origin / proxy)"}</p>

        <div className="upload-tab__file">
          <span className="upload-tab__file-icon" aria-hidden>
            📄
          </span>
          <span className="upload-tab__file-name">{file ? file.name : "No file selected"}</span>
        </div>

        <div className="upload-tab__actions">
          <PrimaryButton title="Choose Excel file" variant="secondary" fullWidth onClick={pickFile} />
          <PrimaryButton
            title={busy ? "Uploading…" : "Upload & register"}
            loading={busy}
            fullWidth
            onClick={handleUpload}
            disabled={!file}
          />
        </div>
      </div>

      {result ? (
        <div className="ui-card upload-tab__results">
          <h3 className="ui-card__title">Upload results</h3>
          <p className="upload-tab__summary">
            {result.registered} registered · {result.failed} failed · {result.total} total rows
          </p>
          <ul className="upload-tab__result-list">
            {result.results.map((row) => (
              <li
                key={`${row.row}-${row.fullName}`}
                className={`upload-tab__result-row${row.ok ? " upload-tab__result-row--ok" : " upload-tab__result-row--fail"}`}
              >
                <span className="upload-tab__result-icon" aria-hidden>
                  {row.ok ? "✓" : "✕"}
                </span>
                <div>
                  <p className="upload-tab__result-name">
                    Row {row.row}: {row.fullName || "(empty name)"}
                  </p>
                  {row.ok ? (
                    <p className="upload-tab__result-meta">Registered successfully</p>
                  ) : (
                    <p className="upload-tab__result-err">{row.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
