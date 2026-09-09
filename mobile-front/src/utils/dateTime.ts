export function formatDateISO(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return formatDateISO(new Date());
}

const TIME12: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

export function formatTime12(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", TIME12);
}

export function formatDateTime12(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...TIME12,
  });
}

export function formatTimeDisplay(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", { ...TIME12, second: "2-digit" });
}

export function formatDateTimeDisplay(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDateTime12(iso);
}

export function formatDateDisplay(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Date-only label for tables (ignores time portion of API datetimes). */
export function formatSchoolDate(iso?: string | null) {
  if (!iso) return "—";
  const raw = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDateDisplay(iso);
  return formatDateDisplay(raw);
}

/** Date-only display for ID cards — no time component. */
export function formatDobDisplay(iso?: string | null) {
  if (!iso) return "—";
  const raw = iso.slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return `${d}/${m}/${y}`;
  return `${d} ${months[mi]} ${y}`;
}

export function parseTime24(value?: string | null) {
  if (!value) return { hours: 7, minutes: 30 };
  const [h, m] = value.split(":").map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

export function formatTime24(hours: number, minutes: number) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatTime12Display(value?: string | null) {
  if (!value) return "—";
  const { hours, minutes } = parseTime24(value);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toLocaleTimeString("en-US", TIME12);
}

export function dateFromTime24(value?: string | null) {
  const { hours, minutes } = parseTime24(value);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export type Time12Period = "AM" | "PM";

export function parseTime12Parts(value?: string | null) {
  const { hours, minutes } = parseTime24(value);
  const period: Time12Period = hours >= 12 ? "PM" : "AM";
  let hour12 = hours % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minutes, period };
}

export function formatTime24From12(
  hour12: number,
  minutes: number,
  period: Time12Period
) {
  let h = hour12 % 12;
  if (period === "PM") h += 12;
  return formatTime24(h, minutes);
}

/** 12-hour Africa/Douala (7:30 AM). */
export function formatDoualaHHMM(iso?: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Douala",
    ...TIME12,
  }).format(d);
}

/** dd/MM Cameroon calendar date. */
export function formatDoualaDDMM(iso?: string | null) {
  if (!iso) return "";
  const raw = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, , mo, d] = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
    if (d && mo) return `${d}/${mo}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Douala",
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return day && month ? `${day}/${month}` : "";
}
