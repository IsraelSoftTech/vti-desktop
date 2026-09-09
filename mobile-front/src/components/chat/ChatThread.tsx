import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import type { ChatMessage } from "../../api/chatTypes";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";
import { ChatImage, SaveFileButton, useAuthedFile } from "./AuthMedia";
import EmojiStickerTray from "./EmojiStickerTray";
import { isLargeEmojiMessage } from "../../utils/chatEmoji";
import {
  CHAT_MAX_VOICE_MS,
  pickChatDocument,
  pickChatImage,
  voicePickFromUri,
  type ChatPick,
} from "../../utils/compressChatMedia";
import { formatDoualaDDMM } from "../../utils/dateTime";

const READ_BLUE = "#53BDEB";
const UNREAD_GREY = "#9CA3AF";

type StudentChip = { id: number; fullName: string };

type Props = {
  mineRole: "parent" | "admin";
  messages: ChatMessage[];
  students?: StudentChip[];
  filePath: (messageId: number) => string;
  sending?: boolean;
  loading?: boolean;
  error?: string;
  onSend: (payload: { body: string; file?: ChatPick }) => Promise<void>;
  onDelete?: (messages: ChatMessage[], scope: "me" | "everyone") => Promise<void>;
  onLoadOlder?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  keyboardVerticalOffset?: number;
};

function dayKey(iso: string) {
  return formatDoualaDDMM(iso) || iso.slice(0, 10);
}

function Tick({ read, light }: { read: boolean; light: boolean }) {
  return (
    <Ionicons
      name="checkmark-done"
      size={15}
      color={read ? READ_BLUE : light ? "rgba(255,255,255,0.72)" : UNREAD_GREY}
    />
  );
}

function AudioBubble({
  path,
  cacheKey,
  mine,
  colors,
  localUri,
}: {
  path: string;
  cacheKey: string;
  mine: boolean;
  colors: AppColors;
  localUri?: string;
}) {
  const remote = useAuthedFile(localUri ? "" : path, cacheKey, "m4a");
  const uri = localUri || remote.uri;
  const loading = !localUri && remote.loading;
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  async function toggle() {
    if (!uri) return;
    if (playing && soundRef.current) {
      await soundRef.current.stopAsync();
      setPlaying(false);
      return;
    }
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
    if (soundRef.current) await soundRef.current.unloadAsync();
    const { sound } = await Audio.Sound.createAsync({ uri });
    soundRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || status.didJustFinish) setPlaying(false);
    });
    await sound.playAsync();
    setPlaying(true);
  }

  return (
    <Pressable onPress={() => void toggle()} style={audioStyles.row}>
      <View style={[audioStyles.play, { backgroundColor: mine ? "rgba(255,255,255,0.2)" : colors.primarySoft }]}>
        {loading ? (
          <ActivityIndicator size="small" color={mine ? "#fff" : colors.primary} />
        ) : (
          <Ionicons
            name={playing ? "pause" : "play"}
            size={16}
            color={mine ? "#fff" : colors.primary}
          />
        )}
      </View>
      <Text style={[audioStyles.label, { color: mine ? "#fff" : colors.text }]}>Voice message</Text>
    </Pressable>
  );
}

const audioStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 160, paddingVertical: 2 },
  play: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 14, fontWeight: "700" },
});

function DocumentBubble({
  path,
  cacheKey,
  name,
  mime,
  mine,
  colors,
  localUri,
}: {
  path: string;
  cacheKey: string;
  name: string;
  mime?: string | null;
  mine: boolean;
  colors: AppColors;
  localUri?: string;
}) {
  const remote = useAuthedFile(localUri ? "" : path, cacheKey, "bin");
  const uri = localUri || remote.uri;
  const loading = !localUri && remote.loading;
  return (
    <View style={docStyles.wrap}>
      <View style={docStyles.row}>
        <Ionicons name="document-text" size={20} color={mine ? "#fff" : colors.primary} />
        <Text style={[docStyles.name, { color: mine ? "#fff" : colors.text }]} numberOfLines={2}>
          {loading ? "Loading…" : name || "Document"}
        </Text>
      </View>
      <SaveFileButton uri={uri} name={name || "document"} mime={mime || "application/octet-stream"} light={mine} />
    </View>
  );
}

const docStyles = StyleSheet.create({
  wrap: { maxWidth: 220, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 13, fontWeight: "700" },
});

export default function ChatThread({
  mineRole,
  messages,
  students = [],
  filePath,
  sending,
  loading,
  error,
  onSend,
  onDelete,
  onLoadOlder,
  emptyTitle = "No messages yet",
  emptyHint = "Send a message to start this conversation.",
  keyboardVerticalOffset,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; name: string; mime: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const selecting = selected.length > 0;
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordMs, setRecordMs] = useState(0);
  const recordMsRef = useRef(0);
  const finishingRef = useRef(false);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const ids = new Set(messages.map((m) => m.id));
    setSelected((prev) => {
      const next = prev.filter((id) => ids.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [messages]);
  const data = useMemo(() => [...messages].reverse(), [messages]);
  const composerPad = 8 + (keyboardOpen ? 0 : Math.min(insets.bottom, 8));

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, () => {
      setKeyboardOpen(true);
      setPickerOpen(false);
      setAttachOpen(false);
    });
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recordTimer.current) clearInterval(recordTimer.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const send = useCallback(
    async (body: string, file?: ChatPick) => {
      const trimmed = body.trim();
      if (!trimmed && !file) return;
      setLocalError("");
      try {
        await onSend({ body: trimmed, file });
        setText("");
        setAttachOpen(false);
        setPickerOpen(false);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : "Could not send.");
      }
    },
    [onSend]
  );

  async function attach(kind: "library" | "camera" | "document") {
    setLocalError("");
    try {
      const pick =
        kind === "document" ? await pickChatDocument() : await pickChatImage(kind);
      if (pick) await send(text, pick);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not attach that file.");
    }
  }

  async function startRecording() {
    setLocalError("");
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) throw new Error("Microphone permission is required for voice notes.");
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync({
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 32000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.LOW,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 32000,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 32000,
        },
      });
      setRecording(rec);
      setRecordMs(0);
      recordMsRef.current = 0;
      finishingRef.current = false;
      const started = Date.now();
      recordTimer.current = setInterval(() => {
        const elapsed = Date.now() - started;
        recordMsRef.current = elapsed;
        setRecordMs(elapsed);
        if (elapsed >= CHAT_MAX_VOICE_MS) {
          void finishRecording(true);
        }
      }, 250);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not start recording.");
    }
  }

  async function finishRecording(sendIt: boolean) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    if (recordTimer.current) {
      clearInterval(recordTimer.current);
      recordTimer.current = null;
    }
    const rec = recordingRef.current;
    setRecording(null);
    if (!rec) {
      finishingRef.current = false;
      return;
    }
    try {
      await rec.stopAndUnloadAsync();
    } catch {
      /* already stopped */
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    const uri = rec.getURI();
    const elapsed = recordMsRef.current;
    if (sendIt && uri && elapsed >= 700) {
      try {
        const pick = await voicePickFromUri(uri);
        await send("", pick);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : "Could not send voice note.");
      }
    }
    setRecordMs(0);
    recordMsRef.current = 0;
    finishingRef.current = false;
  }

  function mention(name: string) {
    setText((prev) => {
      const add = `@${name} `;
      if (prev.includes(add) || prev.includes(`@${name}`)) return prev;
      return prev ? `${prev.trim()} ${add}` : add;
    });
  }

  function toggleSelect(id: number) {
    if (id <= 0) return;
    Keyboard.dismiss();
    setSheetOpen(false);
    setAttachOpen(false);
    setPickerOpen(false);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function clearSelection() {
    setSelected([]);
    setSheetOpen(false);
  }

  const selectedMessages = messages.filter((m) => selected.includes(m.id));
  const canDeleteEveryone =
    selectedMessages.length > 0 &&
    selectedMessages.every((m) => m.senderRole === mineRole && !m.deletedForEveryone);

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = item.senderRole === mineRole;
    const next = data[index + 1];
    const showDay = !next || dayKey(next.createdAt) !== dayKey(item.createdAt);
    const path = item.id > 0 ? filePath(item.id) : "";
    const deleted = Boolean(item.deletedForEveryone);
    const sticker = !deleted && isLargeEmojiMessage(item.body, item.attachmentKind);
    const checked = selected.includes(item.id);
    return (
      <View>
        {showDay ? (
          <View style={styles.dayWrap}>
            <Text style={styles.dayText}>{dayKey(item.createdAt)}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            if (selecting && item.id > 0) toggleSelect(item.id);
          }}
          onLongPress={() => {
            if (item.pending || item.id <= 0 || !onDelete) return;
            toggleSelect(item.id);
          }}
          delayLongPress={280}
          style={[styles.row, selecting && styles.rowSelect, checked && styles.rowChecked]}
        >
          {selecting ? (
            <Ionicons
              name={checked ? "checkbox" : "square-outline"}
              size={22}
              color={checked ? colors.primary : colors.textMuted}
              style={styles.selectBox}
            />
          ) : null}
          <View style={[styles.bubbleAlign, mine ? styles.rowMine : styles.rowTheirs]}>
          <View
            style={[
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleTheirs,
              sticker && styles.bubbleSticker,
              sticker && mine && styles.bubbleStickerMine,
              deleted && styles.bubbleDeleted,
              deleted && mine && styles.bubbleDeletedMine,
              checked && styles.bubbleChecked,
            ]}
          >
            {deleted ? (
              <Text style={[styles.bodyDeleted, mine ? styles.bodyMine : styles.bodyTheirs]}>
                This message was deleted
              </Text>
            ) : (
              <>
            {item.attachmentKind === "image" ? (
              item.localUri ? (
                <View>
                  <Pressable
                    onPress={() => {
                      if (selecting) {
                        toggleSelect(item.id);
                        return;
                      }
                      setPreview({
                        uri: item.localUri || "",
                        name: item.attachmentName || "photo.jpg",
                        mime: item.attachmentMime || "image/jpeg",
                      });
                    }}
                  >
                    <Image
                      source={{ uri: item.localUri }}
                      style={{ width: 220, height: 180, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                  </Pressable>
                  <SaveFileButton
                    uri={item.localUri}
                    name={item.attachmentName || "photo.jpg"}
                    mime={item.attachmentMime || "image/jpeg"}
                    light={mine}
                  />
                </View>
              ) : (
                <ChatImage
                  path={path}
                  cacheKey={`img-${item.id}`}
                  name={item.attachmentName || "photo.jpg"}
                  mime={item.attachmentMime || "image/jpeg"}
                  light={mine}
                  onPress={(uri) => {
                    if (selecting) {
                      toggleSelect(item.id);
                      return;
                    }
                    setPreview({
                      uri,
                      name: item.attachmentName || "photo.jpg",
                      mime: item.attachmentMime || "image/jpeg",
                    });
                  }}
                />
              )
            ) : null}
            {item.attachmentKind === "audio" ? (
              <AudioBubble
                path={item.localUri ? "" : path}
                cacheKey={`aud-${item.id}`}
                mine={mine}
                colors={colors}
                localUri={item.localUri}
              />
            ) : null}
            {item.attachmentKind === "document" ? (
              <DocumentBubble
                path={item.localUri ? "" : path}
                cacheKey={`doc-${item.id}`}
                name={item.attachmentName || "Document"}
                mime={item.attachmentMime}
                mine={mine}
                colors={colors}
                localUri={item.localUri}
              />
            ) : null}
            {item.body ? (
              <Text
                style={[
                  styles.body,
                  mine ? styles.bodyMine : styles.bodyTheirs,
                  sticker && styles.bodySticker,
                ]}
              >
                {item.body}
              </Text>
            ) : null}
              </>
            )}
            <View style={styles.meta}>
              <Text
                style={[
                  styles.time,
                  mine && !sticker && !deleted ? styles.timeMine : styles.timeTheirs,
                  deleted && mine && styles.timeMine,
                ]}
              >
                {item.pending ? "Sending…" : item.timeLabel}
              </Text>
              {mine && !deleted ? <Tick read={item.read} light={!sticker} /> : null}
            </View>
          </View>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset ?? 0}
    >
      {loading && !messages.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          inverted
          style={styles.listFlex}
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onEndReached={onLoadOlder}
          onEndReachedThreshold={0.2}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyHint}>{emptyHint}</Text>
            </View>
          }
        />
      )}
      {error || localError ? <Text style={styles.error}>{error || localError}</Text> : null}

      {selecting ? (
        <View style={[styles.selectBar, { paddingBottom: composerPad }]}>
          <Pressable onPress={clearSelection} hitSlop={8} accessibilityLabel="Cancel selection">
            <Ionicons name="close" size={24} color={colors.primary} />
          </Pressable>
          <Text style={styles.selectCount}>
            {selected.length} selected
          </Text>
          <Pressable
            onPress={() =>
              setSelected(messages.filter((m) => m.id > 0 && !m.pending).map((m) => m.id))
            }
            hitSlop={8}
          >
            <Text style={styles.selectAll}>All</Text>
          </Pressable>
          <Pressable
            onPress={() => setSheetOpen(true)}
            hitSlop={8}
            accessibilityLabel="Delete selected"
          >
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </Pressable>
        </View>
      ) : (
        <>
      {students.length && !keyboardOpen ? (
        <View style={styles.chipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {students.map((s) => (
              <Pressable key={s.id} style={styles.chip} onPress={() => mention(s.fullName)}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {s.fullName}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {attachOpen ? (
        <View style={styles.attachRow}>
          <Pressable style={styles.attachBtn} onPress={() => void attach("camera")}>
            <Ionicons name="camera" size={20} color={colors.primary} />
            <Text style={styles.attachLabel}>Camera</Text>
          </Pressable>
          <Pressable style={styles.attachBtn} onPress={() => void attach("library")}>
            <Ionicons name="image" size={20} color={colors.primary} />
            <Text style={styles.attachLabel}>Photo</Text>
          </Pressable>
          <Pressable style={styles.attachBtn} onPress={() => void attach("document")}>
            <Ionicons name="document-text" size={20} color={colors.primary} />
            <Text style={styles.attachLabel}>Document</Text>
          </Pressable>
          <Pressable
            style={styles.attachBtn}
            onPress={() => {
              setAttachOpen(false);
              void startRecording();
            }}
          >
            <Ionicons name="mic" size={20} color={colors.primary} />
            <Text style={styles.attachLabel}>Voice</Text>
          </Pressable>
        </View>
      ) : null}

      {pickerOpen ? (
        <EmojiStickerTray
          onInsertEmoji={(emoji) => setText((prev) => (prev + emoji).slice(0, 4000))}
          onSendSticker={(emoji) => void send(emoji)}
        />
      ) : null}

      {recording ? (
        <View style={styles.recordBar}>
          <Pressable onPress={() => void finishRecording(false)} hitSlop={8}>
            <Ionicons name="close-circle" size={26} color={colors.danger} />
          </Pressable>
          <View style={styles.recordDot} />
          <Text style={styles.recordTime}>
            {String(Math.floor(recordMs / 60000)).padStart(1, "0")}:
            {String(Math.floor((recordMs / 1000) % 60)).padStart(2, "0")}
          </Text>
          <Pressable style={styles.recordSend} onPress={() => void finishRecording(true)}>
            <Ionicons name="send" size={16} color={colors.white} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: composerPad }]}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              setAttachOpen((v) => !v);
              setPickerOpen(false);
            }}
            accessibilityLabel={attachOpen ? "Close attachments" : "Attach"}
          >
            <Ionicons name={attachOpen ? "close" : "add"} size={24} color={colors.primary} />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              Keyboard.dismiss();
              setPickerOpen((v) => !v);
              setAttachOpen(false);
            }}
            accessibilityLabel="Emoji and stickers"
          >
            <Ionicons
              name={pickerOpen ? "happy" : "happy-outline"}
              size={22}
              color={pickerOpen ? colors.secondary : colors.primary}
            />
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!text.trim() || sending) && styles.sendBtnOff,
            ]}
            disabled={!text.trim() || sending}
            onPress={() => void send(text)}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            hitSlop={8}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="send" size={18} color={colors.white} />
            )}
          </Pressable>
        </View>
      )}
        </>
      )}

      {sheetOpen ? (
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheetOpen(false)} />
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>
              {selected.length === 1 ? "Delete message" : `Delete ${selected.length} messages`}
            </Text>
            <Pressable
              style={styles.menuBtn}
              onPress={async () => {
                const targets = selectedMessages;
                clearSelection();
                if (targets.length && onDelete) await onDelete(targets, "me");
              }}
            >
              <Text style={styles.menuBtnText}>Delete for me</Text>
            </Pressable>
            {canDeleteEveryone ? (
              <Pressable
                style={styles.menuBtn}
                onPress={async () => {
                  const targets = selectedMessages;
                  clearSelection();
                  if (targets.length && onDelete) await onDelete(targets, "everyone");
                }}
              >
                <Text style={styles.menuDanger}>Delete for everyone</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.menuCancel} onPress={() => setSheetOpen(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.lightbox}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreview(null)} />
          {preview ? (
            <>
              <Image source={{ uri: preview.uri }} style={styles.lightboxImg} resizeMode="contain" />
              <SaveFileButton uri={preview.uri} name={preview.name} mime={preview.mime} light />
            </>
          ) : null}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    listFlex: { flex: 1, minHeight: 0 },
    list: { paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    empty: { alignItems: "center", justifyContent: "center", padding: 24, gap: 8, transform: [{ scaleY: -1 }] },
    emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.textSub },
    emptyHint: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
    error: { color: colors.danger, fontSize: 12, fontWeight: "700", paddingHorizontal: 16, paddingBottom: 6 },
    dayWrap: { alignItems: "center", marginVertical: 8 },
    dayText: {
      backgroundColor: colors.surface,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: "hidden",
    },
    row: { marginBottom: 6, flexDirection: "row", alignItems: "flex-end", width: "100%" },
    rowSelect: { paddingVertical: 2 },
    rowChecked: { backgroundColor: "rgba(30, 58, 138, 0.08)", borderRadius: 10, marginHorizontal: -6, paddingHorizontal: 6 },
    selectBox: { marginRight: 8, marginBottom: 8 },
    bubbleAlign: { flex: 1, flexDirection: "row" },
    rowMine: { justifyContent: "flex-end" },
    rowTheirs: { justifyContent: "flex-start" },
    bubble: { maxWidth: "82%", borderRadius: 18, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6 },
    bubbleMine: { backgroundColor: colors.headerStart, borderBottomRightRadius: 6 },
    bubbleTheirs: {
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    body: { fontSize: 15, lineHeight: 21 },
    bodySticker: { fontSize: 42, lineHeight: 50, textAlign: "center" },
    bubbleSticker: {
      backgroundColor: "transparent",
      borderWidth: 0,
      paddingHorizontal: 8,
      paddingTop: 4,
    },
    bubbleStickerMine: { backgroundColor: "transparent" },
    bodyMine: { color: colors.white },
    bodyTheirs: { color: colors.text },
    bodyDeleted: { fontSize: 14, fontStyle: "italic", lineHeight: 20, opacity: 0.82 },
    bubbleDeleted: { opacity: 0.92 },
    bubbleDeletedMine: { backgroundColor: colors.headerStart },
    bubbleChecked: { opacity: 1 },
    selectBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingLeft: 12,
      paddingRight: 16,
      paddingTop: 10,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    selectCount: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.text },
    selectAll: { fontSize: 14, fontWeight: "800", color: colors.primary },
    meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
    time: { fontSize: 11, fontWeight: "700" },
    timeMine: { color: "rgba(255,255,255,0.75)" },
    timeTheirs: { color: colors.textMuted },
    chipsWrap: {
      flexGrow: 0,
      flexShrink: 0,
      maxHeight: 40,
    },
    chips: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 8,
    },
    chip: {
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      alignSelf: "center",
      maxHeight: 28,
      justifyContent: "center",
    },
    chipText: { color: colors.primary, fontWeight: "800", fontSize: 12, lineHeight: 16 },
    attachRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    attachBtn: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      paddingVertical: 10,
      gap: 4,
    },
    attachLabel: { fontSize: 11, fontWeight: "800", color: colors.textSub },
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      flexWrap: "nowrap",
      gap: 4,
      paddingLeft: 6,
      paddingRight: 8,
      paddingTop: 8,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    iconBtn: { width: 36, height: 44, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    input: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      maxHeight: 110,
      minHeight: 40,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: colors.background,
      color: colors.text,
      fontSize: 15,
    },
    sendBtn: {
      position: "relative",
      flexShrink: 0,
      alignSelf: "flex-end",
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.headerStart,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnOff: { opacity: 0.72 },
    recordBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
    recordTime: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.text },
    recordSend: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.headerStart,
      alignItems: "center",
      justifyContent: "center",
    },
    lightbox: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.92)",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    lightboxImg: { width: "100%", height: "80%" },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(16, 24, 40, 0.45)",
      justifyContent: "flex-end",
      zIndex: 20,
    },
    menuCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 18,
      paddingBottom: 28,
      gap: 6,
    },
    menuTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 6 },
    menuBtn: { paddingVertical: 14 },
    menuBtnText: { fontSize: 16, fontWeight: "700", color: colors.text },
    menuDanger: { fontSize: 16, fontWeight: "700", color: colors.danger },
    menuCancel: { paddingVertical: 12, alignItems: "center" },
    menuCancelText: { fontSize: 15, fontWeight: "800", color: colors.primary },
  });
}
