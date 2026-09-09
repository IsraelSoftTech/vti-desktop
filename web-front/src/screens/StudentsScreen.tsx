import { useState } from "react";
import SegmentTabs from "../components/SegmentTabs";
import RegistrationTab from "./students/RegistrationTab";
import UploadTab from "./students/UploadTab";
import RegisteredTab from "./students/RegisteredTab";
import IdCardTab from "./students/IdCardTab";
import "../styles/pagePanel.css";
import "./StudentsScreen.css";

const TABS = [
  { id: "registration" as const, label: "Registration" },
  { id: "upload" as const, label: "Upload" },
  { id: "registered" as const, label: "Registered" },
  { id: "idcard" as const, label: "ID Card" },
];

export default function StudentsScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("registration");

  return (
    <div className="page-panel">
      <div className="page-panel__inner students-screen">
        <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="students-screen__panel">
          {tab === "registration" ? <RegistrationTab /> : null}
          {tab === "upload" ? <UploadTab /> : null}
          {tab === "registered" ? <RegisteredTab /> : null}
          {tab === "idcard" ? <IdCardTab /> : null}
        </div>
      </div>
    </div>
  );
}
