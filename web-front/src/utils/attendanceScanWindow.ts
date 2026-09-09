import { formatTime12Display, formatTime24 } from "./dateTime";

function parseTimeToMinutes(value: string): number {
  const parts = String(value || "07:30").slice(0, 5).split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

function formatClockFromMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = Math.round(totalMin % 60);
  return formatTime12Display(formatTime24(h, m));
}

export function canCheckInAt(
  now: Date,
  schoolStartTime: string,
  schoolEndTime: string,
  graceMinutesAfterStart: number,
  checkInOpensAt?: string
): boolean {
  const nowMin = nowMinutes(now);
  const opensAt = checkInOpensAt || schoolStartTime;
  const openMin = parseTimeToMinutes(opensAt);
  const endMin = parseTimeToMinutes(schoolEndTime);
  const grace = Math.max(0, Number(graceMinutesAfterStart) || 0);
  const startMin = parseTimeToMinutes(schoolStartTime);
  const latestCheckIn = Math.min(endMin, startMin + grace);
  return nowMin >= openMin && nowMin <= latestCheckIn;
}

export function canCheckOutAt(
  now: Date,
  schoolStartTime: string,
  schoolEndTime: string,
  allowCheckoutBeforeEndTime: boolean
): boolean {
  const nowMin = nowMinutes(now);
  const startMin = parseTimeToMinutes(schoolStartTime);
  const endMin = parseTimeToMinutes(schoolEndTime);
  if (allowCheckoutBeforeEndTime) {
    return nowMin >= startMin && nowMin <= endMin;
  }
  return nowMin >= endMin;
}

export function checkInScanBlockReason(
  now: Date,
  schoolStartTime: string,
  schoolEndTime: string,
  graceMinutesAfterStart: number,
  checkInOpensAt?: string
): string | null {
  if (
    canCheckInAt(now, schoolStartTime, schoolEndTime, graceMinutesAfterStart, checkInOpensAt)
  ) {
    return null;
  }
  const nowMin = nowMinutes(now);
  const opensAt = formatTime12Display((checkInOpensAt || schoolStartTime).slice(0, 5));
  const startMin = parseTimeToMinutes(schoolStartTime);
  const endMin = parseTimeToMinutes(schoolEndTime);
  const grace = Math.max(0, Number(graceMinutesAfterStart) || 0);
  const deadline = formatClockFromMinutes(Math.min(endMin, startMin + grace));

  if (nowMin < parseTimeToMinutes((checkInOpensAt || schoolStartTime).slice(0, 5))) {
    return `Check-in opens at ${opensAt}. Scanning is disabled until then.`;
  }
  return `Check-in closed at ${deadline} (${grace} min after school start). Check-in is not available for the rest of today.`;
}

export function checkOutScanBlockReason(
  now: Date,
  schoolStartTime: string,
  schoolEndTime: string,
  allowCheckoutBeforeEndTime: boolean
): string | null {
  if (canCheckOutAt(now, schoolStartTime, schoolEndTime, allowCheckoutBeforeEndTime)) {
    return null;
  }
  const end = formatTime12Display(schoolEndTime.slice(0, 5));
  if (allowCheckoutBeforeEndTime) {
    return `Check-out is only allowed between ${formatTime12Display(schoolStartTime.slice(0, 5))} and ${end}.`;
  }
  return `Check-out opens at ${end} (school end). Early check-out is disabled in Settings.`;
}
