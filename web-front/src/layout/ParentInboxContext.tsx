import { createContext, useContext } from "react";
import type { LinkedStudent, ParentInboxItem } from "../api/parent";

export type ParentInboxCtx = {
  unread: number;
  chatUnread: number;
  inbox: ParentInboxItem[];
  inboxLoading: boolean;
  inboxRefreshing: boolean;
  inboxError: string;
  inboxOpen: boolean;
  studentDay: LinkedStudent | null;
  loadInbox: (mode?: "initial" | "refresh") => Promise<void>;
  refreshUnread: () => Promise<void>;
  removeInboxItems: (ids?: number[]) => void;
  openInbox: () => void;
  closeInbox: () => void;
  openStudentDay: (student: LinkedStudent) => void;
  closeStudentDay: () => void;
  navigate: (route: "Overview" | "Students" | "Chat" | "Fees" | "Settings") => void;
};

export const ParentInboxContext = createContext<ParentInboxCtx | null>(null);

export function useParentInbox() {
  const ctx = useContext(ParentInboxContext);
  if (!ctx) throw new Error("useParentInbox must be used in the parent shell");
  return ctx;
}
