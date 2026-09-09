import { useState } from "react";
import SegmentTabs from "../components/SegmentTabs";
import AcademicYearTab from "./academics/AcademicYearTab";
import ClassesTab from "./academics/ClassesTab";
import DepartmentsTab from "./academics/DepartmentsTab";
import SettingsTab from "./academics/SettingsTab";
import "../styles/pagePanel.css";
import "./StudentsScreen.css";

const TABS = [
  { id: "year" as const, label: "Academic Year" },
  { id: "classes" as const, label: "Classes" },
  { id: "departments" as const, label: "Department" },
  { id: "settings" as const, label: "Settings" },
];

export default function AcademicsScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("year");

  return (
    <div className="page-panel">
      <div className="page-panel__inner students-screen">
        <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="students-screen__panel">
          {tab === "year" ? <AcademicYearTab /> : null}
          {tab === "classes" ? <ClassesTab /> : null}
          {tab === "departments" ? <DepartmentsTab /> : null}
          {tab === "settings" ? <SettingsTab /> : null}
        </div>
      </div>
    </div>
  );
}
