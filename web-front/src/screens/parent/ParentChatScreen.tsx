import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";
import { apiBlob } from "../../api/client";
import type { ChatMessage } from "../../api/chat";
import {
  deleteParentChatMessages,
  getParentChat,
  getParentChatMessages,
  markParentChatRead,
  parentChatFilePath,
  sendParentChatMessage,
} from "../../api/parent";
import { CHAT_MAX_VOICE_MS, compressChatFile } from "../../utils/compressChatMedia";
import { CHAT_EMOJIS, CHAT_STICKERS, isLargeEmojiMessage } from "../../utils/chatEmoji";
import { useParentInbox } from "../../layout/ParentInboxContext";
import { useToast } from "../../context/ToastContext";
import "../ParentChatPane.css";
import "./parentScreens.css";

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

export default function ParentChatScreen() {
  const { refreshUnread } = useParentInbox();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [students, setStudents] = useState<{ id: number; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
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
  const oldestId = useRef<number | null>(null);
  const loadingOlder = useRef(false);

  const merge = useCallback((incoming: ChatMessage[], mode: "replace" | "prepend" | "append") => {
    setMessages((prev) => {
      const map = new Map<number, ChatMessage>();
      const base = mode === "replace" ? [] : prev;
      for (const row of base) map.set(row.id, row);
      for (const row of incoming) map.set(row.id, row);
      return [...map.values()].sort((a, b) => a.id - b.id);
    });
    const ids = incoming.map((m) => m.id).filter((id) => id > 0);
    if (ids.length) {
      const min = Math.min(...ids);
      oldestId.current = oldestId.current == null ? min : Math.min(oldestId.current, min);
    }
  }, []);

  const load = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      try {
        const data = await getParentChat();
        setStudents(data.students || []);
        merge(data.messages || [], "append");
        setError("");
        await markParentChatRead();
        void refreshUnread();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load chat");
      } finally {
        setLoading(false);
      }
    },
    [merge, refreshUnread]
  );

  useEffect(() => {
    void load(true);
    const tick = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(tick);
  }, [load]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function loadOlder() {
    if (loadingOlder.current || !oldestId.current) return;
    loadingOlder.current = true;
    try {
      const data = await getParentChatMessages(oldestId.current);
      merge(data.messages || [], "prepend");
    } catch {
      /* keep */
    } finally {
      loadingOlder.current = false;
    }
  }

  async function onDelete(items: ChatMessage[], scope: "me" | "everyone") {
    const ids = items.map((m) => m.id).filter((id) => id > 0);
    if (!ids.length) return;
    try {
      const result = await deleteParentChatMessages(ids, scope);
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not delete message", "err");
    }
  }

  async function send(body: string, file?: File) {
    const trimmed = body.trim();
    if (!trimmed && !file) return;
    setSending(true);
    try {
      const light = file ? await compressChatFile(file) : undefined;
      const saved = await sendParentChatMessage(trimmed, light);
      setMessages((prev) => [...prev.filter((m) => m.id !== saved.id), saved]);
      setText("");
      setAttachOpen(false);
      setPickerOpen(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not send", "err");
    } finally {
      setSending(false);
    }
  }

  function toggleSelect(id: number) {
    if (id <= 0) return;
    setSheetOpen(false);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (file) await send(text, file);
    if (fileRef.current) fileRef.current.value = "";
    if (docRef.current) docRef.current.value = "";
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
    if (!sendIt)
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
      };
    if (rec.state !== "inactive") rec.stop();
  }

  const selecting = selected.length > 0;
  const selectedMessages = messages.filter((m) => selected.includes(m.id));
  const canDeleteEveryone =
    selectedMessages.length > 0 &&
    selectedMessages.every((m) => m.senderRole === "parent" && !m.deletedForEveryone);
  const studentLabel = students.map((s) => s.fullName).filter(Boolean).join(", ");

  return (
    <div className="parent-page parent-page--chat">
      <div className="parent-page__inner">
        <div className="parent-chat parent-chat--solo">
          <section className="parent-chat__main">
            <header className={`parent-chat__head${selecting ? " is-select" : ""}`}>
              {selecting ? (
                <>
                  <button type="button" className="parent-chat__select-btn" onClick={() => setSelected([])}>
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
                  <h3>School</h3>
                  <p>{studentLabel || "Message the school office"}</p>
                </div>
              )}
            </header>

            {error ? <div className="parent-error" style={{ margin: "8px 12px 0" }}>{error}</div> : null}

            <div
              className="parent-chat__messages"
              ref={listRef}
              onScroll={(e) => {
                if (e.currentTarget.scrollTop < 40) void loadOlder();
              }}
            >
              {loading && !messages.length ? (
                <div className="parent-chat__placeholder">
                  <p>Loading conversation…</p>
                </div>
              ) : !messages.length ? (
                <div className="parent-chat__placeholder">
                  <Icon name="chatbubbles-outline" size={56} />
                  <h3>Message the school</h3>
                  <p>This is one conversation with the school office. Mention a child by name if needed.</p>
                </div>
              ) : (
                messages.map((item) => {
                  const mine = item.senderRole === "parent";
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
                                  path={parentChatFilePath(item.id)}
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
                })
              )}
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
                  disabled={sending || (!text.trim() && !attachOpen)}
                  aria-label="Send message"
                >
                  <Icon name="send" size={18} />
                </button>
              </form>
            )}

            {sheetOpen ? (
              <div className="parent-chat__delete-mask" onClick={() => setSheetOpen(false)}>
                <div className="parent-chat__delete-sheet" onClick={(e) => e.stopPropagation()}>
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
          </section>
        </div>
      </div>
    </div>
  );
}
