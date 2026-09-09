import { useState } from "react";
import SegmentTabs from "../../components/SegmentTabs";
import FeeTypesTab from "./FeeTypesTab";
import FeeSetupTab from "./FeeSetupTab";
import "../../styles/pagePanel.css";
import "../StudentsScreen.css";

const TABS = [
  { id: "types" as const, label: "Fee Types" },
  { id: "setup" as const, label: "Fee Setup" },
];

export default function FeeManagementScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("types");

  return (
    <div className="page-panel">
      <div className="page-panel__inner students-screen">
        <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="students-screen__panel">
          {tab === "types" ? <FeeTypesTab /> : <FeeSetupTab />}
        </div>
      </div>
    </div>
  );
}
