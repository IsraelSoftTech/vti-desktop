const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SCHOOL_WEEKDAY_CHIPS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 7, label: "Sun" },
] as const;

export function previewPairPattern(schoolWeekDays: number[]): string {
  const days = [
    ...new Set(
      schoolWeekDays.filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    ),
  ].sort((a, b) => a - b);
  if (!days.length) return "";
  const labels: string[] = [];
  for (let i = 0; i < days.length; i += 2) {
    const a = days[i];
    const b = days[(i + 1) % days.length];
    const wrap = i + 1 >= days.length || b <= a;
    const left = WEEKDAY_SHORT[a - 1];
    const right = WEEKDAY_SHORT[b - 1];
    labels.push(wrap ? `${left}–next ${right}` : `${left}–${right}`);
  }
  return `Pairs: ${labels.join(", ")}`;
}
