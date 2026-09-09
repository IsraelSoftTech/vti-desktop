import { useCallback, useMemo, useState } from "react";
import PrimaryButton from "../../components/PrimaryButton";
import SelectField from "../../components/SelectField";
import StudentIdCardPreview from "../../components/StudentIdCardPreview";
import { getClasses, getSettings, type SchoolClass } from "../../api/academics";
import { getStudents, type Student } from "../../api/students";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { downloadClassIdCards, downloadStudentIdCard } from "../../utils/idCardPrint";
import "./IdCardTab.css";
import "../../styles/pagePanel.css";

export default function IdCardTab() {
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [classBusy, setClassBusy] = useState(false);

  const studentsLoader = useCallback(() => getStudents(), []);
  const settingsLoader = useCallback(() => getSettings(), []);
  const classesLoader = useCallback(() => getClasses(), []);

  const { data: students } = useCachedQuery<Student[]>(studentsLoader, {
    cacheKey: "students",
    maxAgeMs: 30_000,
  });
  const { data: settings } = useCachedQuery(settingsLoader, {
    cacheKey: "settings",
    maxAgeMs: 60_000,
  });
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });

  const cardOpts = useMemo(
    () => ({
      schoolName: settings?.schoolName || "Izzy Tech Team School",
      academicYear: settings?.activeYear?.name || "Active Year",
      schoolLogoUrl: settings?.schoolLogoUrl || null,
    }),
    [settings]
  );

  const filtered = useMemo(() => {
    const list = students || [];
    if (classFilter === "all") return list;
    return list.filter((s) => String(s.classId) === classFilter);
  }, [students, classFilter]);

  const selected =
    filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null;

  const classOptions = useMemo(() => {
    const opts = [{ id: "all", label: "All classes" }];
    for (const c of classes || []) {
      opts.push({ id: String(c.id), label: c.name });
    }
    return opts;
  }, [classes]);

  const classSelectOptions = useMemo(
    () => classOptions.map((o) => ({ label: o.label, value: o.id })),
    [classOptions]
  );

  async function downloadOne(student: Student) {
    setBusyId(student.id);
    try {
      await downloadStudentIdCard(student, cardOpts);
      showToast(`PDF ready — ${student.fullName}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not generate ID card", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadClass() {
    if (classFilter === "all") {
      showToast("Select a class to download all ID cards.", "err");
      return;
    }
    const className = classes?.find((c) => String(c.id) === classFilter)?.name || "Class";
    const batch = filtered;
    if (!batch.length) {
      showToast("No students in this class.", "err");
      return;
    }
    setClassBusy(true);
    try {
      await downloadClassIdCards(batch, className, cardOpts);
      showToast(`${batch.length} ID cards ready for ${className}.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not generate class PDF", "err");
    } finally {
      setClassBusy(false);
    }
  }

  if (!students?.length) {
    return (
      <div className="id-card-tab__empty">
        <h2>No students yet</h2>
        <p>
          Register students in the Registration tab. Each student gets a unique scannable QR code
          for attendance.
        </p>
      </div>
    );
  }

  return (
    <div className="id-card-tab">
      <div className="id-card-tab__info">
        <h2 className="id-card-tab__info-title">Student ID Cards</h2>
        <p>
          Professional ISO ID-1 cards (85.6 × 53.98 mm) with a large, sharp QR code. Download one student for a single card-sized PDF. Download a class to print 12 cards per A4 page.
        </p>
      </div>

      <SelectField
        label="Filter by class"
        value={classFilter}
        onChange={(v) => {
          setClassFilter(v || "all");
          setSelectedId(null);
        }}
        options={classSelectOptions}
        placeholder="All classes"
      />

      {selected ? (
        <>
          <StudentIdCardPreview student={selected} opts={cardOpts} />
          <div className="id-card-tab__actions">
            <PrimaryButton
              title={busyId === selected.id ? "Generating…" : "Download PDF"}
              loading={busyId === selected.id}
              fullWidth
              onClick={() => downloadOne(selected)}
            />
            {classFilter !== "all" ? (
              <PrimaryButton
                title={classBusy ? "Generating…" : `Download class (${filtered.length})`}
                variant="secondary"
                loading={classBusy}
                fullWidth
                onClick={downloadClass}
              />
            ) : null}
          </div>
        </>
      ) : null}

      <h3 className="id-card-tab__list-title">Students ({filtered.length})</h3>
      <ul className="id-card-tab__list">
        {filtered.map((s) => {
          const active = selected?.id === s.id;
          return (
            <li key={s.id} className={`id-card-tab__row${active ? " id-card-tab__row--active" : ""}`}>
              <button type="button" className="id-card-tab__row-main" onClick={() => setSelectedId(s.id)}>
                <span className="id-card-tab__row-name">{s.fullName}</span>
                <span className="id-card-tab__row-meta">
                  {s.className || "No class"} · {s.barcode}
                </span>
              </button>
              <PrimaryButton
                title={busyId === s.id ? "…" : "PDF"}
                onClick={() => downloadOne(s)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
