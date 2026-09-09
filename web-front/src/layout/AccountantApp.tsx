import { useState } from "react";
import AccountantShell from "./AccountantShell";
import AccountantHomeScreen from "../screens/fee/AccountantHomeScreen";
import StudentsScreen from "../screens/StudentsScreen";
import FeeManagementScreen from "../screens/fee/FeeManagementScreen";
import FeePaymentTab from "../screens/fee/FeePaymentTab";
import FeeCheckTab from "../screens/fee/FeeCheckTab";
import FeeDiscountScreen from "../screens/fee/FeeDiscountScreen";
import FeeReportsScreen from "../screens/fee/FeeReportsScreen";
import MessagesScreen from "../screens/MessagesScreen";
import type { AccountantRoute } from "./accountantNav";

export default function AccountantApp() {
  const [route, setRoute] = useState<AccountantRoute>("Home");

  function renderPage() {
    switch (route) {
      case "Home":
        return <AccountantHomeScreen isFocused={route === "Home"} />;
      case "Students":
        return <StudentsScreen />;
      case "Management":
        return <FeeManagementScreen />;
      case "Payment":
        return <FeePaymentTab />;
      case "Check":
        return <FeeCheckTab />;
      case "Discount":
        return <FeeDiscountScreen />;
      case "Reports":
        return <FeeReportsScreen />;
      case "Messages":
        return <MessagesScreen />;
      default:
        return null;
    }
  }

  return (
    <AccountantShell active={route} onNavigate={setRoute}>
      {renderPage()}
    </AccountantShell>
  );
}
