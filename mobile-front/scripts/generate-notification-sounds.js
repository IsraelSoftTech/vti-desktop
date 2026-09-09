/**
 * Writes short PCM WAV alert tones into assets/sounds.
 * Run: node scripts/generate-notification-sounds.js
 */
const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, "..", "assets", "sounds");

function writeWav(filePath, samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function silence(seconds) {
  return new Array(Math.floor(seconds * SAMPLE_RATE)).fill(0);
}

function tone(freq, duration, { attack = 0.012, decay, gain = 0.42 } = {}) {
  const n = Math.floor(duration * SAMPLE_RATE);
  const dec = decay ?? duration * 0.82;
  const samples = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    let env = 1;
    if (t < attack) env = t / Math.max(attack, 0.001);
    else env = Math.exp((-4.2 * (t - attack)) / Math.max(0.04, dec));
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env * gain;
  }
  return samples;
}

function concat(...parts) {
  return parts.flat();
}

function mix(...layers) {
  const n = Math.max(...layers.map((l) => l.length));
  const out = new Array(n).fill(0);
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i += 1) out[i] += layer[i];
  }
  for (let i = 0; i < n; i += 1) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}

const sounds = {
  chime: concat(tone(523.25, 0.2, { gain: 0.4 }), tone(659.25, 0.38, { gain: 0.44 })),
  bell: mix(
    tone(659.25, 0.95, { gain: 0.38, decay: 0.85 }),
    tone(1318.5, 0.85, { gain: 0.16, decay: 0.7 }),
    tone(1977.75, 0.55, { gain: 0.07, decay: 0.4 })
  ),
  ping: tone(1396.91, 0.2, { gain: 0.5, attack: 0.004, decay: 0.16 }),
  alert: concat(
    tone(880, 0.13, { gain: 0.48, decay: 0.1 }),
    silence(0.07),
    tone(880, 0.18, { gain: 0.5, decay: 0.14 })
  ),
  soft: tone(349.23, 0.58, { gain: 0.3, attack: 0.05, decay: 0.5 }),
  bright: concat(
    tone(523.25, 0.11, { gain: 0.36 }),
    tone(659.25, 0.11, { gain: 0.38 }),
    tone(783.99, 0.3, { gain: 0.42 })
  ),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [id, samples] of Object.entries(sounds)) {
  const filePath = path.join(OUT_DIR, `${id}.wav`);
  writeWav(filePath, samples);
  console.log("wrote", path.relative(path.join(__dirname, ".."), filePath));
}
