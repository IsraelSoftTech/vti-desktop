import type { ReactNode } from "react";
import "./FeeSectionHeader.css";

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export default function FeeSectionHeader({ title, subtitle, right }: Props) {
  return (
    <div className="fee-section-header">
      <div className="fee-section-header__text">
        <h2 className="fee-section-header__title">{title}</h2>
        {subtitle ? <p className="fee-section-header__sub">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}
