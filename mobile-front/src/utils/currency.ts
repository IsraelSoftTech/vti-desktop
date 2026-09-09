export function formatMoney(amount: number) {
  const n = Math.round(Number(amount) * 100) / 100;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function parseMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
