import { useState } from "react";
import SegmentTabs from "../components/SegmentTabs";
import TakeAttendanceTab from "./attendance/TakeAttendanceTab";
import RecordsTab from "./attendance/RecordsTab";
import "../styles/pagePanel.css";
import "./StudentsScreen.css";

const TABS = [
  { id: "checkin" as const, label: "Check-in" },
  { id: "checkout" as const, label: "Check-out" },
  { id: "records" as const, label: "Records" },
];

export default function AttendanceScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("checkin");
  const [refreshKey, setRefreshKey] = useState(0);

  function bumpRecords() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="page-panel">
      <div className="page-panel__inner students-screen">
        <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="students-screen__panel">
          {tab === "checkin" ? (
            <TakeAttendanceTab checkType="check_in" onRecorded={bumpRecords} />
          ) : null}
          {tab === "checkout" ? (
            <TakeAttendanceTab checkType="check_out" onRecorded={bumpRecords} />
          ) : null}
          {tab === "records" ? (
            <RecordsTab refreshKey={refreshKey} onChanged={bumpRecords} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
