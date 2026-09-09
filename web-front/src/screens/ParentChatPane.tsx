import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import TextField from "../components/TextField";
import { apiBlob } from "../api/client";
import {
  adminChatFilePath,
  getAdminChatMessages,
  getAdminChatThread,
  listAdminChatThreads,
  markAdminChatRead,
  sendAdminChatMessage,
  deleteAdminChatMessages,
  type ChatMessage,
  type ChatThreadSummary,
} from "../api/chat";
import { CHAT_MAX_VOICE_MS, compressChatFile } from "../utils/compressChatMedia";
import { CHAT_EMOJIS, CHAT_STICKERS, isLargeEmojiMessage } from "../utils/chatEmoji";
import { useToast } from "../context/ToastContext";
import "./ParentChatPane.css";

function AuthedMedia({
  path,
  kind,
  name,
}: {
  path: string;
  kind: "image" | "audio" | "document";
  name?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    apiBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!url) return <div className="parent-chat__media-ph">Loading…</div>;
  const filename = name || (kind === "image" ? "photo.jpg" : kind === "audio" ? "voice.m4a" : "document");
  const save = (
    <a className="parent-chat__download" href={url} download={filename}>
      Save
    </a>
  );
  if (kind === "image") {
    return (
      <div className="parent-chat__media">
        <a href={url} target="_blank" rel="noreferrer" className="parent-chat__photo-link">
          <img src={url} alt={name || "Photo"} className="parent-chat__photo" />
        </a>
        {save}
      </div>
    );
  }
  if (kind === "audio") {
    return (
      <div className="parent-chat__media">
        <audio className="parent-chat__audio" controls src={url} />
      </div>
    );
  }
  return (
    <div className="parent-chat__media">
      <a className="parent-chat__doc" href={url} download={filename}>
        <Icon name="document-outline" size={18} />
        <span>{name || "Document"}</span>
      </a>
      {save}
    </div>
  );
}

function Tick({ read }: { read: boolean }) {
  return <Icon name="checkmark-done" size={14} className={read ? "tick tick--read" : "tick tick--unread"} />;
}

export default function ParentChatPane() {
  const { showToast } = useToast();
  const [q, setQ] = useState("");
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [header, setHeader] = useState<{ name: string; phone: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"emoji" | "stickers">("emoji");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const oldestRef = useRef<number | null>(null);

  const loadThreads = useCallback(
    async () => {
      try {
        const data = await listAdminChatThreads({ q, pageSize: 50 });
        setThreads(data.threads || []);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load chats", "err");
      }
    },
    [q, showToast]
  );

  useEffect(() => {
    void loadThreads();
    const id = window.setInterval(() => void loadThreads(), 5000);
    return () => window.clearInterval(id);
  }, [loadThreads]);

  const loadThread = useCallback(
    async (id: number) => {
      try {
        const data = await getAdminChatThread(id);
        setHeader({ name: data.thread.parentName, phone: data.thread.parentPhone });
        setMessages((prev) => {
          const incoming = data.messages || [];
          const map = new Map(prev.map((m) => [m.id, m]));
          for (const row of incoming) map.set(row.id, row);
          const next = [...map.values()].sort((a, b) => a.id - b.id);
          const ids = next.map((m) => m.id).filter((id) => id > 0);
          oldestRef.current = ids.length ? Math.min(...ids) : oldestRef.current;
          return next;
        });
        await markAdminChatRead(id);
        void loadThreads();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not open chat", "err");
      }
    },
    [loadThreads, showToast]
  );

  useEffect(() => {
    setMessages([]);
    oldestRef.current = null;
    setSelected([]);
    setSheetOpen(false);
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    void loadThread(openId);
    const id = window.setInterval(() => void loadThread(openId), 4000);
    return () => window.clearInterval(id);
  }, [openId, loadThread]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, openId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelected([]);
        setSheetOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(body: string, file?: File) {
    if (!openId) return;
    const trimmed = body.trim();
    if (!trimmed && !file) return;
    setSending(true);
    try {
      const light = file ? await compressChatFile(file) : undefined;
      const saved = await sendAdminChatMessage(openId, trimmed, light);
      setMessages((prev) => [...prev.filter((m) => m.id !== saved.id), saved]);
      setText("");
      setAttachOpen(false);
      setPickerOpen(false);
      void loadThreads();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not send", "err");
    } finally {
      setSending(false);
    }
  }

  async function onDelete(items: ChatMessage[], scope: "me" | "everyone") {
    if (!openId) return;
    const ids = items.map((m) => m.id).filter((id) => id > 0);
    if (!ids.length) return;
    try {
      const result = await deleteAdminChatMessages(openId, ids, scope);
      setSheetOpen(false);
      setSelected([]);
      if (result.scope === "me") {
        const hide = new Set(result.hiddenIds?.length ? result.hiddenIds : ids);
        setMessages((prev) => prev.filter((m) => !hide.has(m.id)));
      } else {
        const updates = result.messages?.length ? result.messages : result.message ? [result.message] : [];
        if (updates.length) {
          const map = new Map(updates.map((row) => [row.id, row]));
          setMessages((prev) => prev.map((m) => map.get(m.id) || m));
        }
      }
      void loadThreads();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete message", "err");
    }
  }

  function toggleSelect(id: number) {
    if (id <= 0) return;
    setSheetOpen(false);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function clearSelection() {
    setSelected([]);
    setSheetOpen(false);
  }

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (file) await send(text, file);
    if (fileRef.current) fileRef.current.value = "";
    if (docRef.current) docRef.current.value = "";
  }

  async function loadOlder() {
    if (!openId || !oldestRef.current) return;
    try {
      const data = await getAdminChatMessages(openId, oldestRef.current);
      const incoming = data.messages || [];
      if (!incoming.length) return;
      oldestRef.current = Math.min(oldestRef.current, ...incoming.map((m) => m.id));
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const row of incoming) map.set(row.id, row);
        return [...map.values()].sort((a, b) => a.id - b.id);
      });
    } catch {
      /* keep */
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 800) {
          const file = new File([blob], "voice.webm", { type: blob.type });
          await send("", file);
        }
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
      setRecordMs(0);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - started;
        setRecordMs(elapsed);
        if (elapsed >= CHAT_MAX_VOICE_MS) stopRecording(true);
      }, 200);
    } catch {
      showToast("Microphone permission is required for voice notes.", "err");
    }
  }

  function stopRecording(sendIt: boolean) {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = mediaRef.current;
    mediaRef.current = null;
    setRecording(false);
    setRecordMs(0);
    if (!rec) return;
    if (!sendIt) rec.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop());
    };
    if (rec.state !== "inactive") rec.stop();
  }

  const selecting = selected.length > 0;
  const selectedMessages = messages.filter((m) => selected.includes(m.id));
  const canDeleteEveryone =
    selectedMessages.length > 0 &&
    selectedMessages.every((m) => m.senderRole === "admin" && !m.deletedForEveryone);

  return (
    <div className="parent-chat">
      <aside className="parent-chat__list">
        <TextField
          label="Search parents"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or phone"
        />
        <div className="parent-chat__threads">
          {threads.length ? (
            threads.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`parent-chat__thread${openId === row.id ? " is-open" : ""}`}
                onClick={() => setOpenId(row.id)}
              >
                <span className="parent-chat__avatar" aria-hidden>
                  {(row.parentName || "P").slice(0, 1).toUpperCase()}
                </span>
                <span className="parent-chat__thread-copy">
                  <span className="parent-chat__thread-top">
                    <strong>{row.parentName}</strong>
                    <em>{row.timeLabel}</em>
                  </span>
                  <span className="parent-chat__preview">{row.lastMessagePreview || "No messages yet"}</span>
                </span>
                {row.unreadCount > 0 ? <span className="parent-chat__unread">{row.unreadCount}</span> : null}
              </button>
            ))
          ) : (
            <p className="parent-chat__empty-list">No parent conversations yet.</p>
          )}
        </div>
      </aside>

      <section className="parent-chat__main">
        {openId ? (
          <>
            <header className={`parent-chat__head${selecting ? " is-select" : ""}`}>
              {selecting ? (
                <>
                  <button type="button" className="parent-chat__select-btn" onClick={clearSelection}>
                    Cancel
                  </button>
                  <strong className="parent-chat__select-count">{selected.length} selected</strong>
                  <button
                    type="button"
                    className="parent-chat__select-btn"
                    onClick={() => setSelected(messages.filter((m) => m.id > 0).map((m) => m.id))}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="parent-chat__select-btn is-danger"
                    onClick={() => setSheetOpen(true)}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <div>
                  <h3>{header?.name || "Parent"}</h3>
                  <p>{header?.phone}</p>
                </div>
              )}
            </header>
            <div
              className="parent-chat__messages"
              ref={listRef}
              onScroll={(e) => {
                if (e.currentTarget.scrollTop < 40) void loadOlder();
              }}
            >
              {messages.map((item) => {
                const mine = item.senderRole === "admin";
                const sticker = isLargeEmojiMessage(item.body, item.attachmentKind);
                const checked = selected.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`parent-chat__row${mine ? " is-mine" : ""}${selecting ? " is-selecting" : ""}${
                      checked ? " is-checked" : ""
                    }`}
                    onClick={() => {
                      if (selecting && item.id > 0) toggleSelect(item.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (item.id > 0) toggleSelect(item.id);
                    }}
                  >
                    {selecting ? (
                      <input
                        type="checkbox"
                        className="parent-chat__check"
                        checked={checked}
                        onChange={() => toggleSelect(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select message"
                      />
                    ) : null}
                    <div className={`parent-chat__bubble-wrap${mine ? " is-mine" : ""}`}>
                    <div
                      className={`parent-chat__bubble${mine ? " is-mine" : ""}${sticker ? " is-sticker" : ""}${
                        item.deletedForEveryone ? " is-deleted" : ""
                      }`}
                    >
                      {item.deletedForEveryone ? (
                        <p className="parent-chat__deleted">This message was deleted</p>
                      ) : (
                        <>
                          {item.attachmentKind ? (
                            <AuthedMedia
                              path={adminChatFilePath(item.id)}
                              kind={item.attachmentKind}
                              name={item.attachmentName}
                            />
                          ) : null}
                          {item.body ? <p>{item.body}</p> : null}
                        </>
                      )}
                      <span className="parent-chat__meta">
                        {item.timeLabel}
                        {mine && !item.deletedForEveryone ? <Tick read={item.read} /> : null}
                      </span>
                      {!selecting ? (
                      <button
                        type="button"
                        className="parent-chat__msg-menu"
                        aria-label="Select message"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(item.id);
                        }}
                      >
                        ···
                      </button>
                      ) : null}
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {!selecting && pickerOpen && !recording ? (
              <div className="parent-chat__tray">
                <div className="parent-chat__tray-tabs">
                  <button
                    type="button"
                    className={pickerTab === "emoji" ? "is-on" : ""}
                    onClick={() => setPickerTab("emoji")}
                  >
                    Emoji
                  </button>
                  <button
                    type="button"
                    className={pickerTab === "stickers" ? "is-on" : ""}
                    onClick={() => setPickerTab("stickers")}
                  >
                    Stickers
                  </button>
                </div>
                {pickerTab === "emoji" ? (
                  <div className="parent-chat__emoji-grid">
                    {CHAT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setText((prev) => (prev + emoji).slice(0, 4000))}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="parent-chat__sticker-grid">
                    {CHAT_STICKERS.map((s) => (
                      <button key={s.id} type="button" onClick={() => void send(s.emoji)}>
                        <strong>{s.emoji}</strong>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            {selecting ? null : recording ? (
              <div className="parent-chat__record">
                <button type="button" onClick={() => stopRecording(false)}>
                  Cancel
                </button>
                <span className="parent-chat__record-dot" />
                <strong>
                  {Math.floor(recordMs / 60000)}:{String(Math.floor((recordMs / 1000) % 60)).padStart(2, "0")}
                </strong>
                <button type="button" className="parent-chat__send" onClick={() => stopRecording(true)}>
                  Send
                </button>
              </div>
            ) : (
              <form
                className="parent-chat__composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(text);
                }}
              >
                <div className="parent-chat__tools">
                  <button
                    type="button"
                    className="parent-chat__icon"
                    onClick={() => {
                      setPickerOpen((v) => !v);
                      setAttachOpen(false);
                    }}
                    aria-label="Emoji and stickers"
                  >
                    <Icon name="happy-outline" size={20} />
                  </button>
                  <button
                    type="button"
                    className="parent-chat__icon"
                    onClick={() => {
                      setAttachOpen((v) => !v);
                      setPickerOpen(false);
                    }}
                    aria-label="Attach"
                  >
                    <Icon name="attach-outline" size={20} />
                  </button>
                  {attachOpen ? (
                    <div className="parent-chat__attach">
                      <button type="button" onClick={() => fileRef.current?.click()}>
                        <Icon name="image-outline" size={16} /> Photo
                      </button>
                      <button type="button" onClick={() => docRef.current?.click()}>
                        <Icon name="document-outline" size={16} /> Document
                      </button>
                      <button type="button" onClick={() => void startRecording()}>
                        <Icon name="mic-outline" size={16} /> Voice
                      </button>
                    </div>
                  ) : null}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void onPick(e.target.files)}
                />
                <input
                  ref={docRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,application/pdf,text/plain"
                  hidden
                  onChange={(e) => void onPick(e.target.files)}
                />
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Message"
                  rows={1}
                  maxLength={4000}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(text);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="parent-chat__send"
                  disabled={sending || !text.trim()}
                  aria-label="Send message"
                >
                  <Icon name="send" size={18} />
                </button>
              </form>
            )}
            {sheetOpen ? (
              <div className="parent-chat__delete-mask" onClick={() => setSheetOpen(false)}>
                <div
                  className="parent-chat__delete-sheet"
                  onClick={(e) => e.stopPropagation()}
                >
                  <strong>
                    {selected.length === 1 ? "Delete message" : `Delete ${selected.length} messages`}
                  </strong>
                  <button type="button" onClick={() => void onDelete(selectedMessages, "me")}>
                    Delete for me
                  </button>
                  {canDeleteEveryone ? (
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => void onDelete(selectedMessages, "everyone")}
                    >
                      Delete for everyone
                    </button>
                  ) : null}
                  <button type="button" className="is-cancel" onClick={() => setSheetOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="parent-chat__placeholder">
            <Icon name="chatbubbles-outline" size={56} />
            <h3>Parent conversations</h3>
            <p>Select a parent to reply. They see the same thread in the mobile app.</p>
          </div>
        )}
      </section>
    </div>
  );
}
