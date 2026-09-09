import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isAccountant, isParent } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import HomeScreen from "../screens/HomeScreen";
import StudentsScreen from "../screens/StudentsScreen";
import AcademicsScreen from "../screens/AcademicsScreen";
import AttendanceScreen from "../screens/AttendanceScreen";
import MoreScreen, { type MoreTabParams } from "../screens/MoreScreen";
import AccountantHomeScreen from "../screens/fee/AccountantHomeScreen";
import { FeeCheckScreen, FeePaymentScreen } from "../screens/fee/FeeTabScreens";
import { useColors, useTheme } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

export type { MoreTabParams } from "../screens/MoreScreen";

export type AdminTabParamList = {
  Home: undefined;
  Students: undefined;
  Academics: undefined;
  Attendance: undefined;
  More: MoreTabParams | undefined;
};

export type AccountantTabParamList = {
  Home: undefined;
  Students: undefined;
  Payment: undefined;
  Check: undefined;
  More: MoreTabParams | undefined;
};

type TabIconName = keyof typeof Ionicons.glyphMap;

const ADMIN_TAB_ICONS: Record<keyof AdminTabParamList, { active: TabIconName; inactive: TabIconName }> = {
  Home: { active: "home", inactive: "home-outline" },
  Students: { active: "people", inactive: "people-outline" },
  Academics: { active: "school", inactive: "school-outline" },
  Attendance: { active: "clipboard", inactive: "clipboard-outline" },
  More: { active: "grid", inactive: "grid-outline" },
};

const ACCOUNTANT_TAB_ICONS: Record<
  keyof AccountantTabParamList,
  { active: TabIconName; inactive: TabIconName }
> = {
  Home: { active: "home", inactive: "home-outline" },
  Students: { active: "people", inactive: "people-outline" },
  Payment: { active: "cash", inactive: "cash-outline" },
  Check: { active: "scan", inactive: "scan-outline" },
  More: { active: "grid", inactive: "grid-outline" },
};

const AdminTab = createBottomTabNavigator<AdminTabParamList>();
const AccountantTab = createBottomTabNavigator<AccountantTabParamList>();

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
  const name = focused ? icon.active : icon.inactive;
  return (
    <View style={[tabIconStyles.iconWrap, focused && { backgroundColor: activeBg }]}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

function AdminTabs() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <AdminTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [
          styles.tabBar,
          { paddingBottom: Math.max(insets.bottom, 10), height: 64 + Math.max(insets.bottom, 10) },
        ],
        tabBarIcon: ({ color, focused }) => (
          <TabIcon
            icon={ADMIN_TAB_ICONS[route.name]}
            color={color}
            focused={focused}
            activeBg={colors.primarySoft}
          />
        ),
      })}
    >
      <AdminTab.Screen name="Home" component={HomeScreen} />
      <AdminTab.Screen name="Students" component={StudentsScreen} />
      <AdminTab.Screen name="Academics" component={AcademicsScreen} />
      <AdminTab.Screen name="Attendance" component={AttendanceScreen} />
      <AdminTab.Screen name="More" component={MoreScreen} />
    </AdminTab.Navigator>
  );
}

function AccountantTabs() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <AccountantTab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [
          styles.tabBar,
          { paddingBottom: Math.max(insets.bottom, 10), height: 64 + Math.max(insets.bottom, 10) },
        ],
        tabBarIcon: ({ color, focused }) => (
          <TabIcon
            icon={ACCOUNTANT_TAB_ICONS[route.name]}
            color={color}
            focused={focused}
            activeBg={colors.primarySoft}
          />
        ),
      })}
    >
      <AccountantTab.Screen name="Home" component={AccountantHomeScreen} />
      <AccountantTab.Screen name="Students" component={StudentsScreen} />
      <AccountantTab.Screen name="Payment" component={FeePaymentScreen} />
      <AccountantTab.Screen name="Check" component={FeeCheckScreen} />
      <AccountantTab.Screen name="More" component={MoreScreen} />
    </AccountantTab.Navigator>
  );
}

export default function MainTabs() {
  const { user } = useAuth();
  const colors = useColors();
  const { scheme } = useTheme();
  const navTheme = scheme === "dark" ? DarkTheme : DefaultTheme;

  if (isParent(user)) {
    return null;
  }

  return (
    <NavigationContainer
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
      {isAccountant(user) ? <AccountantTabs /> : <AdminTabs />}
    </NavigationContainer>
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
      fontSize: 11,
      fontWeight: "700",
      marginTop: 2,
    },
  });
}
