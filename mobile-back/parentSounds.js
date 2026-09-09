const PARENT_SOUNDS = [
  { id: 'chime', label: 'Chime', file: 'chime.wav' },
  { id: 'bell', label: 'School bell', file: 'bell.wav' },
  { id: 'ping', label: 'Ping', file: 'ping.wav' },
  { id: 'alert', label: 'Alert', file: 'alert.wav' },
  { id: 'soft', label: 'Soft', file: 'soft.wav' },
  { id: 'bright', label: 'Bright', file: 'bright.wav' },
];

const DEFAULT_PARENT_SOUND = 'chime';
const ALLOWED = new Set(PARENT_SOUNDS.map((s) => s.id));

function normalizeParentSound(value) {
  const id = String(value || '')
    .trim()
    .toLowerCase();
  return ALLOWED.has(id) ? id : DEFAULT_PARENT_SOUND;
}

function parentSoundMeta(value) {
  const id = normalizeParentSound(value);
  return PARENT_SOUNDS.find((s) => s.id === id) || PARENT_SOUNDS[0];
}

function parentSoundChannelId(value) {
  return `parent-alert-${normalizeParentSound(value)}`;
}

module.exports = {
  DEFAULT_PARENT_SOUND,
  PARENT_SOUNDS,
  normalizeParentSound,
  parentSoundChannelId,
  parentSoundMeta,
};
