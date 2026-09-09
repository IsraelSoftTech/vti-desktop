import type { IconName } from "../components/Icon";

export type AccountantRoute =
  | "Home"
  | "Students"
  | "Management"
  | "Payment"
  | "Check"
  | "Discount"
  | "Reports"
  | "Messages";

export type AccountantNavItem = {
  id: AccountantRoute;
  label: string;
  activeIcon: IconName;
  inactiveIcon: IconName;
  description?: string;
};

export const ACCOUNTANT_NAV: AccountantNavItem[] = [
  {
    id: "Home",
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    description: "Fee dashboard & overview",
  },
  {
    id: "Students",
    label: "Students",
    activeIcon: "people",
    inactiveIcon: "people-outline",
    description: "Registration & records",
  },
  {
    id: "Management",
    label: "Management",
    activeIcon: "settings",
    inactiveIcon: "settings-outline",
    description: "Fee types & class setup",
  },
  {
    id: "Payment",
    label: "Payment",
    activeIcon: "cash",
    inactiveIcon: "cash-outline",
    description: "Scan or record payments",
  },
  {
    id: "Check",
    label: "Check",
    activeIcon: "scan",
    inactiveIcon: "scan-outline",
    description: "Scan ID & print statements",
  },
  {
    id: "Discount",
    label: "Discount",
    activeIcon: "wallet-outline",
    inactiveIcon: "wallet-outline",
    description: "Fee discounts by student or class",
  },
  {
    id: "Reports",
    label: "Reports",
    activeIcon: "analytics-outline",
    inactiveIcon: "analytics-outline",
    description: "Class fee lists & print",
  },
  {
    id: "Messages",
    label: "Messages",
    activeIcon: "chatbubbles",
    inactiveIcon: "chatbubbles-outline",
    description: "Parent chat, including photos and files they send",
  },
];

export function accountantNavLabel(route: AccountantRoute) {
  return ACCOUNTANT_NAV.find((n) => n.id === route)?.label ?? route;
}
