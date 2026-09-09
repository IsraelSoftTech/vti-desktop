import type { IconName } from "../components/Icon";

export type AdminRoute =
  | "Home"
  | "Students"
  | "Academics"
  | "Attendance"
  | "Reports"
  | "Messages"
  | "Logs"
  | "Settings"
  | "Announcement";

export type AdminNavItem = {
  id: AdminRoute;
  label: string;
  activeIcon: IconName;
  inactiveIcon: IconName;
  description?: string;
};

export const ADMIN_NAV: AdminNavItem[] = [
  {
    id: "Home",
    label: "Dashboard",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    description: "Overview & daily stats",
  },
  {
    id: "Students",
    label: "Students",
    activeIcon: "people",
    inactiveIcon: "people-outline",
    description: "Registration & records",
  },
  {
    id: "Academics",
    label: "Academics",
    activeIcon: "school",
    inactiveIcon: "school-outline",
    description: "Years, classes & settings",
  },
  {
    id: "Attendance",
    label: "Attendance",
    activeIcon: "clipboard",
    inactiveIcon: "clipboard-outline",
    description: "Check-in, records & scans",
  },
  {
    id: "Reports",
    label: "Reports",
    activeIcon: "grid",
    inactiveIcon: "grid-outline",
    description: "Class attendance analysis",
  },
  {
    id: "Messages",
    label: "Messages",
    activeIcon: "chatbubbles",
    inactiveIcon: "chatbubbles-outline",
    description: "SMS log and parent chat",
  },
  {
    id: "Logs",
    label: "Logs",
    activeIcon: "list-outline",
    inactiveIcon: "list-outline",
    description: "System activity history",
  },
  {
    id: "Settings",
    label: "Settings",
    activeIcon: "settings",
    inactiveIcon: "settings-outline",
    description: "School, notifications, check-in and reminders",
  },
  {
    id: "Announcement",
    label: "Announcement",
    activeIcon: "megaphone",
    inactiveIcon: "megaphone-outline",
    description: "Broadcast SMS and parent-app inbox",
  },
];

export function navLabel(route: AdminRoute) {
  return ADMIN_NAV.find((n) => n.id === route)?.label ?? route;
}
