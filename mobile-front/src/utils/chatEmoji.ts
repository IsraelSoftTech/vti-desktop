export const CHAT_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
  "🙂", "😉", "😍", "🥰", "😘", "😋", "😜", "🤗", "🤩", "🤔",
  "😐", "😏", "😌", "😴", "😷", "🤒", "🥵", "🥶", "😎", "🤓",
  "😢", "😭", "😤", "😡", "😱", "😳", "😬", "🙄", "😮", "🤐",
  "👍", "👎", "👏", "🙏", "💪", "✌️", "🤝", "👋", "❤️", "🧡",
  "💛", "💚", "💙", "💜", "🖤", "💯", "✨", "⭐", "🔥", "🎉",
  "✅", "❌", "⏰", "📌", "📚", "✏️", "🏫", "👨‍👩‍👧", "🌞", "🌧️",
];

export const CHAT_STICKERS = [
  { id: "ok", emoji: "👍", label: "OK" },
  { id: "love", emoji: "❤️", label: "Love" },
  { id: "pray", emoji: "🙏", label: "Thanks" },
  { id: "clap", emoji: "👏", label: "Clap" },
  { id: "party", emoji: "🎉", label: "Party" },
  { id: "smile", emoji: "😊", label: "Smile" },
  { id: "laugh", emoji: "😂", label: "Laugh" },
  { id: "wave", emoji: "👋", label: "Hi" },
  { id: "strong", emoji: "💪", label: "Strong" },
  { id: "star", emoji: "⭐", label: "Star" },
  { id: "fire", emoji: "🔥", label: "Fire" },
  { id: "hundred", emoji: "💯", label: "100" },
  { id: "school", emoji: "🏫", label: "School" },
  { id: "books", emoji: "📚", label: "Books" },
  { id: "check", emoji: "✅", label: "Done" },
  { id: "family", emoji: "👨‍👩‍👧", label: "Family" },
];

export function isLargeEmojiMessage(body: string, attachmentKind?: string | null) {
  if (attachmentKind) return false;
  const t = String(body || "").trim();
  if (!t) return false;
  try {
    return /^(?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*\s*){1,4}$/u.test(t);
  } catch {
    return t.length <= 16 && !/[A-Za-z0-9]/.test(t);
  }
}
