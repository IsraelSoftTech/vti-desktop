import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppTopBar from "../components/AppTopBar";
import ScreenLayout from "../components/ScreenLayout";
import ReportsScreen from "./ReportsScreen";
import SettingsScreen from "./SettingsScreen";
import MessagesScreen from "./MessagesScreen";
import LogsScreen from "./LogsScreen";
import AnnouncementPane from "./messages/AnnouncementPane";
import {
  FeeDiscountScreen,
  FeeManagementScreen,
  FeeReportsScreen,
} from "./fee/FeeTabScreens";
import { colors } from "../theme/colors";
import { isAccountant, isAdmin } from "../api/auth";
import { useAuth } from "../context/AuthContext";

export type MoreTabParams = {
  panel?:
    | "management"
    | "discount"
    | "feeReports"
    | "messages"
    | "reports"
    | "settings"
    | "announcement"
    | "logs";
};

type MenuItemId =
  | "reports"
  | "messages"
  | "settings"
  | "announcement"
  | "logs"
  | "management"
  | "discount"
  | "feeReports";

type MenuItem = {
  id: MenuItemId;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
};

type ActivePanel = "menu" | MenuItemId;

const MENU: MenuItem[] = [
  {
    id: "reports",
    label: "Reports",
    subtitle: "Class attendance analysis & PDF export",
    icon: "bar-chart",
    color: colors.primary,
    bg: colors.primarySoft,
  },
  {
    id: "messages",
    label: "Messages",
    subtitle: "SMS log and parent chat",
    icon: "chatbubbles-outline",
    color: colors.accentTeal,
    bg: colors.accentTealSoft,
  },
  {
    id: "logs",
    label: "Logs",
    subtitle: "Everything done on the system",
    icon: "list-outline",
    color: colors.accentPeach,
    bg: colors.accentPeachSoft,
  },
  {
    id: "settings",
    label: "Settings",
    subtitle: "Guardian SMS notifications",
    icon: "settings-outline",
    color: colors.accentPurple,
    bg: "#f0edff",
  },
  {
    id: "announcement",
    label: "Announcement",
    subtitle: "Broadcast SMS and parent-app inbox",
    icon: "megaphone-outline",
    color: colors.secondary,
    bg: colors.secondarySoft,
  },
];

const ACCOUNTANT_MENU: MenuItem[] = [
  {
    id: "management",
    label: "Management",
    subtitle: "Fee types and class fee setup",
    icon: "settings-outline",
    color: colors.primary,
    bg: colors.primarySoft,
  },
  {
    id: "discount",
    label: "Discount",
    subtitle: "Applies to the student's total fees, not each fee type",
    icon: "pricetag-outline",
    color: colors.accentPeach,
    bg: colors.accentPeachSoft,
  },
  {
    id: "feeReports",
    label: "Reports",
    subtitle: "Fee lists, cash and bank tenders",
    icon: "analytics-outline",
    color: colors.accentPurple,
    bg: "#f0edff",
  },
  {
    id: "messages",
    label: "Messages",
    subtitle: "Parent chat, including photos and files they send",
    icon: "chatbubbles-outline",
    color: colors.accentTeal,
    bg: colors.accentTealSoft,
  },
];

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.subHeader, { paddingTop: insets.top > 0 ? 0 : 4 }]}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="arrow-back" size={22} color={colors.primaryDark} />
        <Text style={styles.backText}>More</Text>
      </Pressable>
      <Text style={styles.subTitle}>{title}</Text>
    </View>
  );
}

export default function MoreScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const accountant = isAccountant(user);
  const menu = accountant
    ? ACCOUNTANT_MENU
    : isAdmin(user)
      ? MENU
      : MENU.filter((item) => item.id !== "logs" && item.id !== "announcement");
  const [active, setActive] = useState<ActivePanel>("menu");
  const [parentChatOpen, setParentChatOpen] = useState(false);

  useEffect(() => {
    const unsub = navigation.addListener("blur", () => {
      setActive("menu");
      setParentChatOpen(false);
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    const panel = (route.params as MoreTabParams | undefined)?.panel;
    if (!panel) return;
    setActive(panel);
    navigation.setParams({ panel: undefined } as never);
  }, [navigation, route.params]);

  if (active === "settings") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AppTopBar />
        <SubHeader title="Settings" onBack={() => setActive("menu")} />
        <View style={styles.embeddedWrap}>
        <SettingsScreen embedded />
        </View>
      </View>
    );
  }

  if (active === "announcement") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AppTopBar />
        <SubHeader title="Announcement" onBack={() => setActive("menu")} />
        <View style={styles.embeddedWrap}>
          <AnnouncementPane />
        </View>
      </View>
    );
  }

  if (active === "messages") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        {parentChatOpen ? null : <AppTopBar />}
        {parentChatOpen ? null : <SubHeader title="Messages" onBack={() => setActive("menu")} />}
        <View style={styles.embeddedWrap}>
          <MessagesScreen embedded onParentChatOpenChange={setParentChatOpen} />
        </View>
      </View>
    );
  }

  if (active === "reports") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AppTopBar />
        <SubHeader title="Reports" onBack={() => setActive("menu")} />
        <ReportsScreen embedded />
      </View>
    );
  }

  if (active === "logs") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AppTopBar />
        <SubHeader title="Logs" onBack={() => setActive("menu")} />
        <View style={styles.embeddedWrap}>
          <LogsScreen embedded />
        </View>
      </View>
    );
  }

  if (active === "management") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AppTopBar />
        <SubHeader title="Management" onBack={() => setActive("menu")} />
        <View style={styles.embeddedWrap}>
          <FeeManagementScreen embedded />
        </View>
      </View>
    );
  }

  if (active === "discount") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AppTopBar />
        <SubHeader title="Discount" onBack={() => setActive("menu")} />
        <View style={styles.embeddedWrap}>
          <FeeDiscountScreen embedded />
        </View>
      </View>
    );
  }

  if (active === "feeReports") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <AppTopBar />
        <SubHeader title="Reports" onBack={() => setActive("menu")} />
        <View style={styles.embeddedWrap}>
          <FeeReportsScreen embedded />
        </View>
      </View>
    );
  }

  return (
    <ScreenLayout>
      <ScrollView contentContainerStyle={styles.menuScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>More</Text>
        <Text style={styles.subheading}>Additional tools and modules</Text>
        <View style={styles.grid}>
          {menu.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.menuCard, pressed && styles.menuCardPressed]}
              onPress={() => setActive(item.id)}
            >
              <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={28} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuSub}>{item.subtitle}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} style={styles.chevron} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  embeddedWrap: { flex: 1, width: "100%" },
  menuScroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  heading: { fontSize: 24, fontWeight: "800", color: colors.primaryDark },
  subheading: { marginTop: 4, marginBottom: 20, fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  grid: { gap: 14 },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
    position: "relative",
  },
  menuCardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  menuLabel: { fontSize: 18, fontWeight: "800", color: colors.text },
  menuSub: { marginTop: 4, fontSize: 12, color: colors.textMuted, fontWeight: "600", lineHeight: 18, paddingRight: 28 },
  chevron: { position: "absolute", right: 20, top: "50%" },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8 },
  backText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  subTitle: { fontSize: 18, fontWeight: "800", color: colors.primaryDark },
});
