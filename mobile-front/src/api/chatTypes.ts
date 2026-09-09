export type ChatAttachmentKind = "image" | "audio" | "document";

export type ChatSenderRole = "parent" | "admin";

export type ChatMessage = {
  id: number;
  threadId: number;
  senderRole: ChatSenderRole;
  senderUserId: number | null;
  body: string;
  attachmentKind: ChatAttachmentKind | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  createdAt: string;
  timeLabel: string;
  readAt: string | null;
  read: boolean;
  deletedForEveryone?: boolean;
  localUri?: string;
  pending?: boolean;
};

export type ChatThreadSummary = {
  id: number;
  parentUserId: number;
  parentName: string;
  parentPhone: string;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastSenderRole: ChatSenderRole | null;
  timeLabel: string;
  unreadCount: number;
};

export type ChatUploadFile = {
  uri: string;
  name: string;
  mime: string;
};
