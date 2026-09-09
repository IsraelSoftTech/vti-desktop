import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import ScreenLayout from "../components/ScreenLayout";
import SegmentTabs from "../components/SegmentTabs";
import RegistrationTab from "./students/RegistrationTab";
import UploadTab from "./students/UploadTab";
import RegisteredTab from "./students/RegisteredTab";
import IdCardTab from "./students/IdCardTab";

const TABS = [
  { id: "registration" as const, label: "Registration" },
  { id: "upload" as const, label: "Upload" },
  { id: "registered" as const, label: "Registered" },
  { id: "idcard" as const, label: "ID Card" },
];

export default function StudentsScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("registration");

  return (
    <ScreenLayout>
      <View style={styles.body}>
        <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
        <View style={styles.panel}>
          {tab === "registration" ? (
            <RegistrationTab />
          ) : tab === "upload" ? (
            <UploadTab />
          ) : tab === "registered" ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.registeredScroll}>
              <RegisteredTab />
            </ScrollView>
          ) : (
            <IdCardTab />
          )}
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  panel: { flex: 1 },
  registeredScroll: { flexGrow: 1 },
});
