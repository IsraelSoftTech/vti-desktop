import { useState } from "react";
import { StyleSheet, View } from "react-native";
import SegmentTabs from "../../components/SegmentTabs";
import FeeTypesTab from "./FeeTypesTab";
import FeeSetupTab from "./FeeSetupTab";

const TABS = [
  { id: "types" as const, label: "Fee Types" },
  { id: "setup" as const, label: "Fee Setup" },
];

export default function FeeManagementTab() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("types");

  return (
    <View style={styles.root}>
      <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />
      <View style={styles.panel}>
        {tab === "types" ? <FeeTypesTab /> : <FeeSetupTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  panel: { flex: 1, minHeight: 0 },
});
