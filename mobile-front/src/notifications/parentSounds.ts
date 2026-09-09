export const DEFAULT_PARENT_SOUND = "chime";

export type ParentSoundId = "chime" | "bell" | "ping" | "alert" | "soft" | "bright";

export type ParentSoundOption = {
  id: ParentSoundId;
  label: string;
  hint: string;
  file: string;
  channelId: string;
};

export const PARENT_SOUNDS: ParentSoundOption[] = [
  {
    id: "chime",
    label: "Chime",
    hint: "Clear two-note greeting",
    file: "chime.wav",
    channelId: "parent-alert-chime",
  },
  {
    id: "bell",
    label: "School bell",
    hint: "Classic bell with a short ring",
    file: "bell.wav",
    channelId: "parent-alert-bell",
  },
  {
    id: "ping",
    label: "Ping",
    hint: "Short high ping",
    file: "ping.wav",
    channelId: "parent-alert-ping",
  },
  {
    id: "alert",
    label: "Alert",
    hint: "Two urgent beeps",
    file: "alert.wav",
    channelId: "parent-alert-alert",
  },
  {
    id: "soft",
    label: "Soft",
    hint: "Gentle low tone",
    file: "soft.wav",
    channelId: "parent-alert-soft",
  },
  {
    id: "bright",
    label: "Bright",
    hint: "Quick rising notes",
    file: "bright.wav",
    channelId: "parent-alert-bright",
  },
];

const ALLOWED = new Set(PARENT_SOUNDS.map((s) => s.id));

export function normalizeParentSound(value: unknown): ParentSoundId {
  const id = String(value || "")
    .trim()
    .toLowerCase();
  return ALLOWED.has(id as ParentSoundId) ? (id as ParentSoundId) : DEFAULT_PARENT_SOUND;
}

export function parentSoundMeta(value: unknown): ParentSoundOption {
  const id = normalizeParentSound(value);
  return PARENT_SOUNDS.find((s) => s.id === id) || PARENT_SOUNDS[0];
}

export const PARENT_SOUND_ASSETS: Record<ParentSoundId, number> = {
  chime: require("../../assets/sounds/chime.wav"),
  bell: require("../../assets/sounds/bell.wav"),
  ping: require("../../assets/sounds/ping.wav"),
  alert: require("../../assets/sounds/alert.wav"),
  soft: require("../../assets/sounds/soft.wav"),
  bright: require("../../assets/sounds/bright.wav"),
};
