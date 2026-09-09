import type { IconName } from "../components/Icon";

export type ParentRoute = "Overview" | "Students" | "Chat" | "Fees" | "Settings";

export type ParentNavItem = {
  id: ParentRoute;
  label: string;
  activeIcon: IconName;
  inactiveIcon: IconName;
  description?: string;
};

export const PARENT_NAV: ParentNavItem[] = [
  {
    id: "Overview",
    label: "Overview",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    description: "Attendance and fee snapshot",
  },
  {
    id: "Students",
    label: "Students",
    activeIcon: "people",
    inactiveIcon: "people-outline",
    description: "Link and monitor children",
  },
  {
    id: "Chat",
    label: "Chat",
    activeIcon: "chatbubbles",
    inactiveIcon: "chatbubbles-outline",
    description: "Message the school",
  },
  {
    id: "Fees",
    label: "Fees",
    activeIcon: "card",
    inactiveIcon: "card-outline",
    description: "Read-only fee statements",
  },
  {
    id: "Settings",
    label: "Settings",
    activeIcon: "settings",
    inactiveIcon: "settings-outline",
    description: "Privacy and account",
  },
];

export function parentNavLabel(route: ParentRoute) {
  return PARENT_NAV.find((n) => n.id === route)?.label ?? route;
}
