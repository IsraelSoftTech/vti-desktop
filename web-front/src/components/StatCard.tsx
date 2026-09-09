import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import "./StatCard.css";

type Props = {
  label: string;
  value: string;
  icon: IconName;
  accent: string;
  accentSoft: string;
};

export default function StatCard({ label, value, icon, accent, accentSoft }: Props) {
  return (
    <article className="stat-card">
      <span className="stat-card__bar" style={{ backgroundColor: accent }} aria-hidden />
      <div className="stat-card__icon" style={{ backgroundColor: accentSoft, color: accent }}>
        <Icon name={icon} size={22} />
      </div>
      <p className="stat-card__value">{value}</p>
      <p className="stat-card__label">{label}</p>
    </article>
  );
}

export function StatSkeleton() {
  return (
    <article className="stat-card stat-card--skeleton" aria-hidden>
      <div className="stat-card__sk-icon" />
      <div className="stat-card__sk-line stat-card__sk-line--lg" />
      <div className="stat-card__sk-line stat-card__sk-line--sm" />
    </article>
  );
}

export function StatCardGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}
