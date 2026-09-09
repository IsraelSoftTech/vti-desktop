import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { useEffect, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LinkedStudent, ParentInboxItem } from "../api/parent";
import {
  consumeLastParentPushTap,
  subscribeParentPushTaps,
  type ParentPushPayload,
} from "../notifications/parentPush";
import ParentOverviewScreen from "../screens/parent/ParentOverviewScreen";
import ParentHomeScreen from "../screens/parent/ParentHomeScreen";
import ParentStudentDayScreen from "../screens/parent/ParentStudentDayScreen";
import ParentNotificationsScreen from "../screens/parent/ParentNotificationsScreen";
import ParentSettingsScreen from "../screens/parent/ParentSettingsScreen";
import ParentChatScreen from "../screens/parent/ParentChatScreen";
import ParentFeesScreen from "../screens/parent/ParentFeesScreen";
import { useColors, useTheme } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";
import { useParentInbox } from "./ParentInboxContext";

export type ParentTabParamList = {
  Overview: undefined;
  Students: undefined;
  Chat: undefined;
  Fees: undefined;
  Settings: undefined;
};

export const parentNavRef = createNavigationContainerRef<ParentTabParamList>();

const Tab = createBottomTabNavigator<ParentTabParamList>();

type TabIconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<keyof ParentTabParamList, { active: TabIconName; inactive: TabIconName }> = {
  Overview: { active: "home", inactive: "home-outline" },
  Students: { active: "people", inactive: "people-outline" },
  Chat: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  Fees: { active: "card", inactive: "card-outline" },
  Settings: { active: "settings", inactive: "settings-outline" },
};

function TabIcon({
  icon,
  color,
  focused,
  activeBg,
}: {
  icon: { active: TabIconName; inactive: TabIconName };
  color: string;
  focused: boolean;
  activeBg: string;
}) {
  return (
    <View style={[tabIconStyles.iconWrap, focused && { backgroundColor: activeBg }]}>
      <Ionicons name={focused ? icon.active : icon.inactive} size={22} color={color} />
    </View>
  );
}

function studentFromItem(item: ParentInboxItem): LinkedStudent | null {
  const id = Number(item.data?.studentId || item.studentId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    fullName: String(item.data?.studentName || item.studentName || "Student"),
    className: null,
    barcode: "",
    photoUrl: null,
  };
}

export default function ParentTabs() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
  const {
    inbox,
    inboxLoading,
    inboxRefreshing,
    inboxError,
    inboxOpen,
    studentDay,
    chatUnread,
    loadInbox,
    openInbox,
    closeInbox,
    openStudentDay,
    closeStudentDay,
  } = useParentInbox();
  const tabBarHeight = 64 + Math.max(insets.bottom, 10);

  function openFromInbox(item: ParentInboxItem) {
    if (item.kind === "announcement" || item.data?.screen === "inbox") {
      return;
    }
    closeInbox();
    if (item.kind === "admin_chat" || item.data?.screen === "chat") {
      if (parentNavRef.isReady()) parentNavRef.navigate("Chat");
      return;
    }
    const student = studentFromItem(item);
    if (student) openStudentDay(student);
  }

  useEffect(() => {
    function openFromAlert(data: ParentPushPayload) {
      const chat = data.screen === "chat" || data.kind === "admin_chat";
      if (chat) {
        closeInbox();
        closeStudentDay();
        if (parentNavRef.isReady()) parentNavRef.navigate("Chat");
        return;
      }
      const studentId = Number(data.studentId);
      if (data.screen === "student_day" && Number.isFinite(studentId) && studentId > 0) {
        closeInbox();
        openStudentDay({
          id: studentId,
          fullName: String(data.studentName || "Student"),
          className: null,
          barcode: "",
          photoUrl: null,
        });
        return;
      }
      openInbox();
    }

    const sub = subscribeParentPushTaps(openFromAlert);
    void consumeLastParentPushTap().then((data) => {
      if (data) openFromAlert(data);
    });
    return () => sub.remove();
  }, [closeInbox, closeStudentDay, openInbox, openStudentDay]);

  return (
    <View style={styles.root}>
      <NavigationContainer
        ref={parentNavRef}
        theme={{
          ...navTheme,
          colors: {
            ...navTheme.colors,
            primary: colors.primary,
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
            notification: colors.secondary,
          },
        }}
      >
        <Tab.Navigator
          initialRouteName="Overview"
          screenOptions={({ route }) => ({
            headerShown: false,
            lazy: true,
            tabBarHideOnKeyboard: true,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: styles.tabLabel,
            tabBarStyle: [
              styles.tabBar,
              { paddingBottom: Math.max(insets.bottom, 10), height: tabBarHeight },
            ],
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                icon={TAB_ICONS[route.name]}
                color={color}
                focused={focused}
                activeBg={colors.primarySoft}
              />
            ),
          })}
        >
          <Tab.Screen name="Overview" component={ParentOverviewScreen} />
          <Tab.Screen name="Students" component={ParentHomeScreen} />
          <Tab.Screen
            name="Chat"
            component={ParentChatScreen}
            options={{
              tabBarBadge: chatUnread > 0 ? (chatUnread > 9 ? "9+" : chatUnread) : undefined,
              tabBarBadgeStyle: {
                backgroundColor: colors.secondary,
                fontSize: 10,
                fontWeight: "800",
              },
            }}
          />
          <Tab.Screen name="Fees" component={ParentFeesScreen} />
          <Tab.Screen name="Settings" component={ParentSettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>

      {studentDay ? (
        <View style={styles.dayOverlay}>
          <ParentStudentDayScreen student={studentDay} onBack={closeStudentDay} />
        </View>
      ) : null}

      {inboxOpen ? (
        <View style={styles.inboxOverlay}>
          <ParentNotificationsScreen
            items={inbox}
            loading={inboxLoading}
            refreshing={inboxRefreshing}
            error={inboxError}
            showBack
            markReadOnOpen
            title="Notifications"
            emptyText="No notifications yet."
            onBack={closeInbox}
            onRefresh={() => loadInbox("refresh")}
            onOpenItem={openFromInbox}
          />
        </View>
      ) : null}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    dayOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background,
      zIndex: 18,
    },
    inboxOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background,
      zIndex: 20,
    },
    tabBar: {
      backgroundColor: colors.surface,
      borderTopWidth: 0,
      elevation: 12,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 1,
      shadowRadius: 16,
      paddingTop: 8,
    },
    tabLabel: {
      fontSize: 10,
      fontWeight: "700",
      marginTop: 2,
    },
  });
}
