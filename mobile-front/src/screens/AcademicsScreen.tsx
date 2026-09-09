import { useState } from "react";
import { StyleSheet, View } from "react-native";
import ScreenLayout from "../components/ScreenLayout";
import SegmentTabs from "../components/SegmentTabs";
import AcademicYearTab from "./academics/AcademicYearTab";
import ClassesTab from "./academics/ClassesTab";
import DepartmentsTab from "./academics/DepartmentsTab";
import SettingsTab from "./academics/SettingsTab";

const TABS = [
  { id: "year" as const, label: "Academic Year" },
  { id: "classes" as const, label: "Classes" },
  { id: "departments" as const, label: "Department" },
  { id: "settings" as const, label: "Settings" },
];

export default function AcademicsScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("year");

  return (
    <ScreenLayout>
      <View style={styles.body}>
        <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
        <View style={styles.panel}>
          {tab === "year" ? <AcademicYearTab /> : null}
          {tab === "classes" ? <ClassesTab /> : null}
          {tab === "departments" ? <DepartmentsTab /> : null}
          {tab === "settings" ? <SettingsTab /> : null}
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  panel: {
    flex: 1,
  },
});
