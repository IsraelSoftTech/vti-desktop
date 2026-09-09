import { useCallback } from "react";
import Icon from "../../components/Icon";
import StudentAvatar from "../../components/StudentAvatar";
import { getParentStudentDay, type LinkedStudent, type StudentDayPayload } from "../../api/parent";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { useParentInbox } from "../../layout/ParentInboxContext";
import "./parentScreens.css";

const MISSING = "--:--";

type Props = {
  student: LinkedStudent;
  onBack: () => void;
};

function noticeAccent(kind: string) {
  if (kind === "pair_summary") return { bg: "var(--color-success-soft)", fg: "var(--color-success)" };
  if (kind === "missed_checkout") return { bg: "var(--color-reserved-bg)", fg: "var(--color-reserved)" };
  return { bg: "var(--color-danger-soft)", fg: "var(--color-danger)" };
}

export default function ParentStudentDayScreen({ student, onBack }: Props) {
  const { unread, openInbox } = useParentInbox();
  const loader = useCallback(() => getParentStudentDay(student.id), [student.id]);
  const { data, loading, error } = useCachedQuery<StudentDayPayload>(loader, {
    cacheKey: `parent-day-${student.id}`,
    maxAgeMs: 20_000,
  });

  const day = data?.today;
  const notices = data?.notices || [];
  const profile = data?.student || student;

  return (
    <div className="parent-overlay">
      <div className="parent-overlay__top">
        <button type="button" className="parent-overlay__icon" aria-label="Back" onClick={onBack}>
          <Icon name="chevron-back" size={22} />
        </button>
        <h1 className="parent-overlay__title">Today’s attendance</h1>
        <button type="button" className="parent-overlay__icon" aria-label="Notifications" onClick={openInbox}>
          <Icon name="notifications-outline" size={20} />
          {unread > 0 ? (
            <span className="parent-overlay__badge">{unread > 9 ? "9+" : unread}</span>
          ) : null}
        </button>
      </div>

      <div className="parent-notice-list">
        <div className="parent-student">
          <StudentAvatar studentId={profile.id} photoUrl={profile.photoUrl} size={64} />
          <div className="parent-student__body">
            <p className="parent-student__name" style={{ fontSize: 18 }}>
              {profile.fullName}
            </p>
            <p className="parent-student__meta">{profile.className || "No class"}</p>
            <p className="parent-student__meta" style={{ color: "var(--color-reserved)", fontWeight: 700 }}>
              {profile.barcode}
            </p>
          </div>
        </div>

        {error && !data ? <div className="parent-error">{error}</div> : null}

        <div className="parent-times">
          <h2 className="parent-times__title">Today {day?.dateLabel ? `(${day.dateLabel})` : ""}</h2>
          <div className="parent-times__row">
            <div className="parent-times__block">
              <p className="parent-times__label">Check-in</p>
              <p className="parent-times__value">{day?.checkIn || MISSING}</p>
            </div>
            <div className="parent-times__divider" />
            <div className="parent-times__block">
              <p className="parent-times__label">Check-out</p>
              <p className="parent-times__value">{day?.checkOut || MISSING}</p>
            </div>
          </div>
          <p className="parent-times__hint">12-hour, Cameroon time</p>
        </div>

        <h2 className="parent-times__title">Recent notices</h2>
        {loading && !data ? (
          <div className="parent-skeleton" />
        ) : notices.length === 0 ? (
          <div className="parent-card">
            <p className="parent-settings__hint">No miss or pair-summary notices yet.</p>
          </div>
        ) : (
          notices.map((n, i) => {
            const a = noticeAccent(n.kind);
            return (
              <div key={`${n.kind}-${n.date}-${i}`} className="parent-notice">
                <span className="parent-notice__dot" style={{ background: a.fg }} />
                <div>
                  <p className="parent-notice__kind" style={{ color: a.fg }}>
                    {n.kindLabel}
                  </p>
                  <p className="parent-notice__body">{n.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
