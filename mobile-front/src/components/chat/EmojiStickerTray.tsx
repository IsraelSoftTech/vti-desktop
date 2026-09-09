import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CHAT_EMOJIS, CHAT_STICKERS } from "../../utils/chatEmoji";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";
import { useMemo, useState } from "react";

type Props = {
  onInsertEmoji: (emoji: string) => void;
  onSendSticker: (emoji: string) => void;
};

export default function EmojiStickerTray({ onInsertEmoji, onSendSticker }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<"emoji" | "stickers">("emoji");

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === "emoji" && styles.tabOn]}
          onPress={() => setTab("emoji")}
        >
          <Text style={[styles.tabText, tab === "emoji" && styles.tabTextOn]}>Emoji</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "stickers" && styles.tabOn]}
          onPress={() => setTab("stickers")}
        >
          <Text style={[styles.tabText, tab === "stickers" && styles.tabTextOn]}>Stickers</Text>
        </Pressable>
      </View>
      {tab === "emoji" ? (
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.gridScroll}>
          <View style={styles.emojiGrid}>
            {CHAT_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                style={styles.emojiCell}
                onPress={() => onInsertEmoji(emoji)}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.gridScroll}>
          <View style={styles.stickerGrid}>
            {CHAT_STICKERS.map((s) => (
              <Pressable key={s.id} style={styles.sticker} onPress={() => onSendSticker(s.emoji)}>
                <Text style={styles.stickerEmoji}>{s.emoji}</Text>
                <Text style={styles.stickerLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      maxHeight: 220,
    },
    tabs: { flexDirection: "row", paddingHorizontal: 10, paddingTop: 8, gap: 8 },
    tab: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.background,
    },
    tabOn: { backgroundColor: colors.primarySoft },
    tabText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
    tabTextOn: { color: colors.primary },
    gridScroll: { maxHeight: 168 },
    emojiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    emojiCell: {
      width: "12.5%",
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    emoji: { fontSize: 22 },
    stickerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      padding: 10,
      gap: 8,
    },
    sticker: {
      width: "22%",
      flexGrow: 1,
      maxWidth: "24%",
      backgroundColor: colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      paddingVertical: 8,
      gap: 2,
    },
    stickerEmoji: { fontSize: 32 },
    stickerLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted },
  });
}
