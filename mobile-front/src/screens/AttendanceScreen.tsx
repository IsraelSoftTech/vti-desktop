import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import ScreenLayout from "../components/ScreenLayout";
import SegmentTabs from "../components/SegmentTabs";
import TakeAttendanceTab from "./attendance/TakeAttendanceTab";
import RecordsTab from "./attendance/RecordsTab";

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
    <ScreenLayout>
      <View style={styles.body}>
        <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
        <ScrollView
          style={styles.panel}
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {tab === "checkin" ? (
            <TakeAttendanceTab checkType="check_in" onRecorded={bumpRecords} />
          ) : null}
          {tab === "checkout" ? (
            <TakeAttendanceTab checkType="check_out" onRecorded={bumpRecords} />
          ) : null}
          {tab === "records" ? (
            <RecordsTab refreshKey={refreshKey} onChanged={bumpRecords} />
          ) : null}
        </ScrollView>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  panel: { flex: 1 },
  panelContent: { flexGrow: 1 },
});
