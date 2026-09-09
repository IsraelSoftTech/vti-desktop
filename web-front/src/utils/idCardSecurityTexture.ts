/** Colorful security card background (guilloche, holographic wash, school watermark). */

export const TEXTURE_VIEW_W = 856;
export const TEXTURE_VIEW_H = 540;

const COLORS = {
  pink: "#f06292",
  rose: "#e53935",
  coral: "#ff8a65",
  gold: "#ffb300",
  lime: "#c0ca33",
  green: "#43a047",
  teal: "#00897b",
  cyan: "#00acc1",
  sky: "#29b6f6",
  blue: "#1e88e5",
  violet: "#7e57c2",
  navy: "#1a53ff",
};

function escSvg(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function schoolInitials(schoolName: string): string {
  const words = String(schoolName || "SCHOOL")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "ID";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function horizontalColorWash(): string {
  return `<rect width="${TEXTURE_VIEW_W}" height="${TEXTURE_VIEW_H}" fill="url(#pearlBase)"/>
  <rect width="${TEXTURE_VIEW_W}" height="${TEXTURE_VIEW_H}" fill="url(#holoSheen)" opacity="0.45"/>
  <rect width="300" height="${TEXTURE_VIEW_H}" fill="url(#washPink)" opacity="0.42"/>
  <rect x="180" width="380" height="${TEXTURE_VIEW_H}" fill="url(#washGoldGreen)" opacity="0.38"/>
  <rect x="500" width="356" height="${TEXTURE_VIEW_H}" fill="url(#washCyanBlue)" opacity="0.44"/>`;
}

function guillocheHorizontal(): string {
  const lines: string[] = [];
  const palette = [
    COLORS.rose,
    COLORS.pink,
    COLORS.coral,
    COLORS.gold,
    COLORS.lime,
    COLORS.green,
    COLORS.teal,
    COLORS.cyan,
    COLORS.sky,
    COLORS.blue,
  ];
  for (let i = 0; i <= 52; i++) {
    const y = 2 + i * 10.2;
    const amp = 3.5 + (i % 5) * 1.8;
    const stroke = palette[i % palette.length];
    const o = 0.32 + (i % 3) * 0.06;
    lines.push(
      `<path d="M-40 ${y} C ${90 + (i % 8) * 12} ${y - amp} ${280} ${y + amp} ${420} ${y} S ${620} ${y - amp} ${780} ${y} S ${920} ${y + amp} 900 ${y}" fill="none" stroke="${stroke}" stroke-width="0.5" opacity="${o}"/>`
    );
  }
  return lines.join("");
}

function guillocheVertical(): string {
  const lines: string[] = [];
  const palette = [COLORS.pink, COLORS.gold, COLORS.green, COLORS.cyan, COLORS.blue, COLORS.violet];
  for (let i = 0; i <= 32; i++) {
    const x = 6 + i * 26;
    const amp = 4 + (i % 4);
    const stroke = palette[i % palette.length];
    lines.push(
      `<path d="M${x} -30 Q ${x + amp} 140 ${x - amp / 2} 270 T ${x + amp} 570" fill="none" stroke="${stroke}" stroke-width="0.42" opacity="0.36"/>`
    );
  }
  return lines.join("");
}

function concentricRings(cx: number, cy: number, count: number, step: number, color: string, opacity: number): string {
  const rings: string[] = [];
  for (let r = step; r <= step * count; r += step) {
    rings.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${r * 1.05}" ry="${r * 0.82}" fill="none" stroke="${color}" stroke-width="0.7" opacity="${opacity}"/>`
    );
  }
  return rings.join("");
}

function fingerprintArcs(cx: number, cy: number, scale: number, stroke: string, opacity: number): string {
  const s = scale;
  return `<g transform="translate(${cx} ${cy}) scale(${s})" opacity="${opacity}" stroke="${stroke}" stroke-width="3.6" stroke-linecap="round" fill="none">
    <ellipse cx="0" cy="0" rx="48" ry="58"/>
    <ellipse cx="0" cy="0" rx="34" ry="42"/>
    <ellipse cx="0" cy="0" rx="22" ry="28"/>
    <ellipse cx="0" cy="0" rx="10" ry="14"/>
    <path d="M-48 2c0-26 22-46 48-46"/>
    <path d="M48 2c0-26-22-46-48-46"/>
    <path d="M-36 18 Q -12 -8 12 -22"/>
    <path d="M36 18 Q 12 -8 -12 -22"/>
    <path d="M-28 32 Q 0 14 28 32"/>
    <path d="M0 58c-8 12-8 24 0 34"/>
  </g>`;
}

function microtextRows(): string {
  const rows: string[] = [];
  const phrase = "MPASAT · OFFICIAL STUDENT ID · VALID ONLY WHEN ISSUED · ";
  for (let i = 0; i < 18; i++) {
    const y = 22 + i * 28;
    const opacity = 0.07 + (i % 3) * 0.015;
    rows.push(
      `<text x="-20" y="${y}" fill="${COLORS.navy}" font-size="11" font-family="Arial,sans-serif" font-weight="700" opacity="${opacity}" transform="rotate(-12 428 ${y})">${escSvg(phrase.repeat(4))}</text>`
    );
  }
  return rows.join("");
}

function schoolWatermark(schoolName: string): string {
  const initials = schoolInitials(schoolName);
  const label = escSvg(String(schoolName || "SCHOOL").toUpperCase().slice(0, 42));
  return `<g opacity="0.11" fill="${COLORS.navy}" font-family="Arial,sans-serif" font-weight="800">
    <text x="428" y="248" text-anchor="middle" font-size="52" letter-spacing="6">${escSvg(initials)}</text>
    <text x="428" y="292" text-anchor="middle" font-size="18" letter-spacing="2">${label}</text>
    <text x="428" y="318" text-anchor="middle" font-size="13" letter-spacing="4" opacity="0.85">STUDENT ID CARD</text>
  </g>`;
}

function loopBorder(): string {
  return `<g opacity="0.38" fill="none" stroke-width="0.9">
    <rect x="14" y="12" width="828" height="516" rx="18" stroke="${COLORS.blue}" stroke-dasharray="6 4"/>
    <path d="M20 18 Q 120 8 220 18 T 420 18 T 620 18 T 836 18" stroke="${COLORS.green}"/>
    <path d="M20 522 Q 120 532 220 522 T 420 522 T 620 522 T 836 522" stroke="${COLORS.rose}"/>
  </g>`;
}

function centralWatermark(): string {
  return `<g opacity="0.16">
    ${concentricRings(440, 268, 16, 8, COLORS.coral, 0.95)}
    ${concentricRings(440, 268, 12, 10, COLORS.teal, 0.9)}
  </g>
  ${fingerprintArcs(430, 285, 1.2, COLORS.green, 0.32)}
  ${fingerprintArcs(435, 290, 1.15, COLORS.coral, 0.26)}
  ${fingerprintArcs(425, 280, 1.1, COLORS.blue, 0.22)}
  ${fingerprintArcs(700, 370, 0.58, COLORS.teal, 0.22)}
  ${fingerprintArcs(140, 380, 0.52, COLORS.gold, 0.2)}`;
}

export function buildIdCardSecurityTextureSvg(schoolName = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TEXTURE_VIEW_W} ${TEXTURE_VIEW_H}">
  <defs>
    <linearGradient id="pearlBase" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#f5f9ff"/>
      <stop offset="65%" stop-color="#f0fdf4"/>
      <stop offset="100%" stop-color="#eff6ff"/>
    </linearGradient>
    <linearGradient id="holoSheen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f48fb1" stop-opacity="0.25"/>
      <stop offset="25%" stop-color="#fff176" stop-opacity="0.2"/>
      <stop offset="50%" stop-color="#81c784" stop-opacity="0.22"/>
      <stop offset="75%" stop-color="#4dd0e1" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#64b5f6" stop-opacity="0.28"/>
    </linearGradient>
    <linearGradient id="washPink" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f48fb1" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="#ef5350" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="washGoldGreen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffee58" stop-opacity="0.3"/>
      <stop offset="50%" stop-color="#aed581" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#81c784" stop-opacity="0.22"/>
    </linearGradient>
    <linearGradient id="washCyanBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4dd0e1" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#42a5f5" stop-opacity="0.58"/>
    </linearGradient>
  </defs>
  ${horizontalColorWash()}
  <g>${guillocheHorizontal()}</g>
  <g>${guillocheVertical()}</g>
  ${microtextRows()}
  ${schoolWatermark(schoolName)}
  ${centralWatermark()}
  ${loopBorder()}
</svg>`;
}

export function idCardSecurityTextureDataUrl(schoolName = ""): string {
  return `data:image/svg+xml,${encodeURIComponent(buildIdCardSecurityTextureSvg(schoolName))}`;
}

/** CSS background stack for HTML preview / print */
export function idCardTextureBackgroundCss(widthPx: number, heightPx: number, schoolName = ""): string {
  const tex = idCardSecurityTextureDataUrl(schoolName);
  return `linear-gradient(145deg, rgba(255,255,255,0.82) 0%, rgba(237,242,255,0.62) 48%, rgba(255,255,255,0.78) 100%), ${tex} center / ${widthPx}px ${heightPx}px no-repeat, linear-gradient(180deg, #f8fafc 0%, #eef2ff 50%, #f0fdf4 100%)`;
}

/** Rasterize SVG texture for jsPDF (browser only). */
export function rasterizeSecurityTexturePng(schoolName = ""): Promise<string | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TEXTURE_VIEW_W;
      canvas.height = TEXTURE_VIEW_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, TEXTURE_VIEW_W, TEXTURE_VIEW_H);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = idCardSecurityTextureDataUrl(schoolName);
  });
}

type JsPdfLike = {
  setLineWidth: (w: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  ellipse: (x: number, y: number, rx: number, ry: number, style?: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  setGlobalAlpha?: (a: number) => void;
  getGlobalAlpha?: () => number;
};

/** Vector fallback when SVG rasterize unavailable (e.g. React Native PDF). */
export function drawSecurityTextureVector(
  doc: JsPdfLike,
  cardW: number,
  cardH: number,
  bodyTop: number,
  bodyH: number,
  ox = 0,
  oy = 0
) {
  const prev = typeof doc.getGlobalAlpha === "function" ? doc.getGlobalAlpha() : 1;
  const cx = ox + cardW / 2;
  const cy = oy + bodyTop + bodyH / 2;
  const bands: [number, number, number][] = [
    [229, 115, 115],
    [255, 183, 77],
    [129, 199, 132],
    [77, 182, 172],
    [66, 165, 245],
  ];

  if (typeof doc.setGlobalAlpha === "function") doc.setGlobalAlpha(0.42);
  doc.setLineWidth(0.12);
  for (let i = 0; i < 55; i++) {
    const y = oy + 1 + i * (cardH / 55);
    const band = bands[i % bands.length];
    doc.setDrawColor(band[0], band[1], band[2]);
    doc.line(ox, y, ox + cardW, y + (i % 2 ? 1.4 : -1.4));
  }
  if (typeof doc.setGlobalAlpha === "function") doc.setGlobalAlpha(0.38);
  doc.setLineWidth(0.34);
  doc.setDrawColor(67, 160, 71);
  doc.ellipse(cx, cy, 28, 32, "S");
  doc.setDrawColor(239, 83, 80);
  doc.ellipse(cx, cy, 20, 24, "S");
  doc.setDrawColor(30, 136, 229);
  doc.ellipse(cx, cy, 12, 15, "S");
  if (typeof doc.setGlobalAlpha === "function") doc.setGlobalAlpha(prev);
}
