import { useState } from "react";
import AdminShell from "./AdminShell";
import HomeScreen from "../screens/HomeScreen";
import StudentsScreen from "../screens/StudentsScreen";
import AcademicsScreen from "../screens/AcademicsScreen";
import AttendanceScreen from "../screens/AttendanceScreen";
import ReportsScreen from "../screens/ReportsScreen";
import MessagesScreen from "../screens/MessagesScreen";
import LogsScreen from "../screens/LogsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import AnnouncementScreen from "../screens/AnnouncementScreen";
import type { AdminRoute } from "./adminNav";

export default function AdminApp() {
  const [route, setRoute] = useState<AdminRoute>("Home");

  function renderPage() {
    switch (route) {
      case "Home":
        return <HomeScreen isFocused={route === "Home"} />;
      case "Students":
        return <StudentsScreen />;
      case "Academics":
        return <AcademicsScreen />;
      case "Attendance":
        return <AttendanceScreen />;
      case "Reports":
        return <ReportsScreen />;
      case "Messages":
        return <MessagesScreen />;
      case "Logs":
        return <LogsScreen />;
      case "Settings":
        return <SettingsScreen />;
      case "Announcement":
        return <AnnouncementScreen />;
      default:
        return null;
    }
  }

  return (
    <AdminShell active={route} onNavigate={setRoute}>
      {renderPage()}
    </AdminShell>
  );
}
