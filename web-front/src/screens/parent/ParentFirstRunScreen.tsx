import { useState } from "react";
import Icon from "../../components/Icon";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import ThemeToggle from "../../components/ThemeToggle";
import { linkParentStudents } from "../../api/parent";
import { useAuth } from "../../context/AuthContext";
import "./parentScreens.css";

const MIN = 1;
const MAX = 10;

export default function ParentFirstRunScreen() {
  const { refreshUser, logout } = useAuth();
  const [count, setCount] = useState(1);
  const [codes, setCodes] = useState<string[]>([""]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fields = Array.from({ length: count }, (_, i) => i);

  function setCountSafe(next: number) {
    const n = Math.min(MAX, Math.max(MIN, next));
    setCount(n);
    setCodes((prev) => {
      const copy = prev.slice(0, n);
      while (copy.length < n) copy.push("");
      return copy;
    });
  }

  async function handleProceed() {
    setError("");
    const barcodes = codes.map((c) => c.trim());
    if (barcodes.some((c) => !c)) {
      setError("Enter a barcode for each student.");
      return;
    }
    const seen = new Set<string>();
    for (const code of barcodes) {
      const key = code.toUpperCase();
      if (seen.has(key)) {
        setError("Duplicate barcodes in the form.");
        return;
      }
      seen.add(key);
    }

    setSaving(true);
    try {
      await linkParentStudents(barcodes);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link students");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="parent-first-run">
      <header className="parent-first-run__header">
        <div className="parent-first-run__header-row">
          <div style={{ flex: 1 }}>
            <p className="parent-first-run__kicker">First-time setup</p>
            <h1 className="parent-first-run__title">Link your children</h1>
          </div>
          <div className="parent-first-run__actions">
            <ThemeToggle />
            <button type="button" className="parent-first-run__logout" onClick={() => void logout()}>
              Logout
            </button>
          </div>
        </div>
        <p className="parent-first-run__subtitle">
          Type the barcode printed on each student’s ID card. You can add more later.
        </p>
      </header>

      <div className="parent-first-run__body">
        <div className="parent-first-run__card">
          <p className="parent-first-run__question">How many students do you want to monitor?</p>
          <div className="parent-stepper">
            <button
              type="button"
              className="parent-stepper__btn"
              disabled={count <= MIN}
              onClick={() => setCountSafe(count - 1)}
              aria-label="Fewer students"
            >
              <Icon name="remove" size={20} />
            </button>
            <span className="parent-stepper__value">{count}</span>
            <button
              type="button"
              className="parent-stepper__btn"
              disabled={count >= MAX}
              onClick={() => setCountSafe(count + 1)}
              aria-label="More students"
            >
              <Icon name="add" size={20} />
            </button>
          </div>
          <p className="parent-first-run__hint">1–10 students. Default is 1.</p>

          <div className="parent-first-run__fields">
            {fields.map((i) => (
              <TextField
                key={i}
                label={count === 1 ? "Student barcode" : `Student ${i + 1} barcode`}
                value={codes[i] || ""}
                onChange={(e) =>
                  setCodes((prev) => {
                    const next = [...prev];
                    next[i] = e.target.value;
                    return next;
                  })
                }
                autoCapitalize="characters"
                autoCorrect="off"
                placeholder="Number on the ID card"
              />
            ))}
          </div>

          {error ? <div className="parent-error">{error}</div> : null}

          <PrimaryButton
            title={saving ? "Linking…" : "Proceed"}
            loading={saving}
            onClick={() => void handleProceed()}
          />
        </div>
      </div>
    </div>
  );
}
