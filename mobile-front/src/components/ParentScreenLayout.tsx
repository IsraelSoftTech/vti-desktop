import { ReactNode } from "react";
import ScreenLayout from "./ScreenLayout";
import { useParentInbox } from "../navigation/ParentInboxContext";

export default function ParentScreenLayout({
  children,
  showHeader = true,
}: {
  children: ReactNode;
  showHeader?: boolean;
}) {
  const { unread, openInbox } = useParentInbox();
  return (
    <ScreenLayout
      notificationCount={unread}
      onNotificationsPress={openInbox}
      showHeader={showHeader}
    >
      {children}
    </ScreenLayout>
  );
}
