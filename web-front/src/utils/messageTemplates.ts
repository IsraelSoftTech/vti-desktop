export const MESSAGE_TEMPLATE_KEYS = [
  "check_in",
  "check_out",
  "absence",
  "missed_checkout",
  "once_day_misser",
  "once_day_non_misser",
  "twice_day_misser_in",
  "twice_day_misser_out",
  "pair_summary",
] as const;

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number];
export type GuardianMessageTemplates = Record<MessageTemplateKey, string>;

export type MessageTemplateToken = { token: string; label: string };
export type MessageTemplateField = {
  key: MessageTemplateKey;
  label: string;
  hint: string;
};

export type MessageTemplateMeta = {
  tokens: MessageTemplateToken[];
  fields: MessageTemplateField[];
  defaults: GuardianMessageTemplates;
  smsMax: number;
  previewSample: Record<string, string>;
};

export const SMS_MAX = 160;

export const DEFAULT_TEMPLATES: GuardianMessageTemplates = {
  check_in:
    "Hello, [guardian-name], your child [student-name] entered school today [date] at [checkin]. Late by [minute-late]. Thank you. [school-name].",
  check_out:
    "Hello, [guardian-name], your child [student-name] left school today [date] at [checkout]. Thank you. [school-name].",
  absence:
    "Hello, [guardian-name], your child [student-name] did not check in on [date]. Marked absent. Thank you. [school-name].",
  missed_checkout:
    "Hello, [guardian-name], your child [student-name] checked in at [checkin] on [date] but did not check out. Thank you. [school-name].",
  once_day_misser:
    "Hello, [guardian-name], your child [student-name] on [date]: check-in [checkin], check-out [checkout]. Thank you. [school-name].",
  once_day_non_misser:
    "Hello, [guardian-name], your child [student-name] entered school today [date] at [checkin] and left at [checkout]. Late by [minute-late]. Thank you. [school-name].",
  twice_day_misser_in: "",
  twice_day_misser_out: "",
  pair_summary:
    "Hello, [guardian-name], your child [student-name] entered school today [date] at [checkin] and left at [checkout]. Late by [minute-late]. Thank you. [school-name].",
};

export const DEFAULT_TEMPLATE_FIELDS: MessageTemplateField[] = [
  {
    key: "check_in",
    label: "Check-in (present child)",
    hint: "Normal SMS and parent-app check-in.",
  },
  {
    key: "check_out",
    label: "Check-out (present child)",
    hint: "Normal SMS, misser checkout SMS, and parent-app check-out.",
  },
  {
    key: "absence",
    label: "Missed check-in",
    hint: "Twice-a-day / Normal: no check-in by the reminder. Parent-app missed check-in.",
  },
  {
    key: "missed_checkout",
    label: "Missed check-out",
    hint: "Twice-a-day / Normal: checked in but never out. Parent-app missed check-out.",
  },
  {
    key: "once_day_misser",
    label: "Once-a-day summary (missers)",
    hint: "One SMS at the checkout reminder. Parent-app still uses missed check-in / check-out at each reminder.",
  },
  {
    key: "once_day_non_misser",
    label: "Once-a-day summary (present)",
    hint: "Saved for a present-child daily message. Completers currently receive the pair-summary format after two complete school days.",
  },
  {
    key: "twice_day_misser_in",
    label: "Twice-a-day misser — check-in miss (optional)",
    hint: "Leave blank to reuse Missed check-in.",
  },
  {
    key: "twice_day_misser_out",
    label: "Twice-a-day misser — check-out miss (optional)",
    hint: "Leave blank to reuse Missed check-out.",
  },
  {
    key: "pair_summary",
    label: "Pair summary (end of pair)",
    hint: "[date], [checkin], [checkout] use day 2. Extra tokens: [date-1] [checkin-1] [checkout-1] [date-2] [checkin-2] [checkout-2].",
  },
];

export const DEFAULT_TEMPLATE_TOKENS: MessageTemplateToken[] = [
  { token: "[guardian-name]", label: "Guardian name" },
  { token: "[student-name]", label: "Student name" },
  { token: "[school-name]", label: "School name" },
  { token: "[date]", label: "Date" },
  { token: "[time]", label: "Time" },
  { token: "[checkin]", label: "Check-in" },
  { token: "[checkout]", label: "Check-out" },
  { token: "[minute-late]", label: "Minutes late" },
  { token: "[date-1]", label: "Pair day 1 date" },
  { token: "[checkin-1]", label: "Pair day 1 in" },
  { token: "[checkout-1]", label: "Pair day 1 out" },
  { token: "[date-2]", label: "Pair day 2 date" },
  { token: "[checkin-2]", label: "Pair day 2 in" },
  { token: "[checkout-2]", label: "Pair day 2 out" },
];

const TOKEN_ALIASES: Record<string, string> = {
  checkou: "checkout",
};

const DEFAULT_PREVIEW_SAMPLE: Record<string, string> = {
  "guardian-name": "Marie Ngo",
  "student-name": "Jean Mbarga",
  "school-name": "Izzy Tech Team School",
  date: "02/09",
  time: "3:30 PM",
  checkin: "7:45 AM",
  checkout: "3:30 PM",
  "minute-late": "15",
  "date-1": "01/09",
  "checkin-1": "7:42 AM",
  "checkout-1": "3:28 PM",
  "date-2": "02/09",
  "checkin-2": "7:45 AM",
  "checkout-2": "3:30 PM",
};

export function emptyTemplates(): GuardianMessageTemplates {
  const out = {} as GuardianMessageTemplates;
  for (const key of MESSAGE_TEMPLATE_KEYS) out[key] = "";
  return out;
}

export function normalizeTemplates(raw: unknown): GuardianMessageTemplates {
  const out = emptyTemplates();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const key of MESSAGE_TEMPLATE_KEYS) {
    if (src[key] == null) continue;
    out[key] = String(src[key]);
  }
  return out;
}

export function normalizeTemplateMeta(raw: unknown): MessageTemplateMeta {
  const src = raw && typeof raw === "object" ? (raw as Partial<MessageTemplateMeta>) : {};
  const defaults = normalizeTemplates(src.defaults || DEFAULT_TEMPLATES);
  const tokens =
    Array.isArray(src.tokens) && src.tokens.length
      ? src.tokens
          .filter((t) => t && typeof t.token === "string")
          .map((t) => ({ token: String(t.token), label: String(t.label || t.token) }))
      : DEFAULT_TEMPLATE_TOKENS;
  const fields =
    Array.isArray(src.fields) && src.fields.length
      ? src.fields
          .filter(
            (f): f is MessageTemplateField =>
              !!f && MESSAGE_TEMPLATE_KEYS.includes(f.key as MessageTemplateKey)
          )
          .map((f) => ({
            key: f.key,
            label: String(f.label || f.key),
            hint: String(f.hint || ""),
          }))
      : DEFAULT_TEMPLATE_FIELDS;
  const smsMax = Number(src.smsMax) > 0 ? Math.round(Number(src.smsMax)) : SMS_MAX;
  const previewSample = {
    ...DEFAULT_PREVIEW_SAMPLE,
    ...(src.previewSample && typeof src.previewSample === "object" ? src.previewSample : {}),
  };
  return { tokens, fields, defaults, smsMax, previewSample };
}

export function renderPreview(template: string, vars: Record<string, string>): string {
  return String(template || "").replace(/\[([^\]]+)\]/g, (full, raw) => {
    const key = String(raw || "")
      .trim()
      .toLowerCase();
    const canon = TOKEN_ALIASES[key] || key;
    if (Object.prototype.hasOwnProperty.call(vars, canon)) {
      const v = vars[canon];
      return v == null ? "" : String(v);
    }
    return full;
  });
}

export function pickPreviewTemplate(
  templates: GuardianMessageTemplates,
  key: MessageTemplateKey
): { text: string; reusedFrom: MessageTemplateKey | null } {
  const direct = String(templates[key] || "").trim();
  if (direct) return { text: direct, reusedFrom: null };
  if (key === "twice_day_misser_in" && String(templates.absence || "").trim()) {
    return { text: templates.absence, reusedFrom: "absence" };
  }
  if (key === "twice_day_misser_out" && String(templates.missed_checkout || "").trim()) {
    return { text: templates.missed_checkout, reusedFrom: "missed_checkout" };
  }
  return { text: "", reusedFrom: null };
}

export function samplePreviewVars(
  schoolName: string,
  previewSample?: Record<string, string>
): Record<string, string> {
  return {
    ...DEFAULT_PREVIEW_SAMPLE,
    ...(previewSample || {}),
    "school-name": schoolName || previewSample?.["school-name"] || "Izzy Tech Team School",
  };
}

export function insertAt(text: string, token: string, start: number, end: number): string {
  const value = String(text || "");
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  return `${value.slice(0, from)}${token}${value.slice(to)}`;
}
