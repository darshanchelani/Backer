import { format, formatDistanceToNowStrict } from "date-fns";

export function fmtMoney(n: number, currency = "USD", compact = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n);
}

export function fmtNumber(n: number, compact = false): string {
  return new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n);
}

export function fmtPercent(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

export function fmtDate(d: Date | string): string {
  return format(new Date(d), "MMM d, yyyy");
}

export function fmtDateTime(d: Date | string): string {
  return format(new Date(d), "MMM d, yyyy 'at' h:mm a");
}

export function fmtRelative(d: Date | string): string {
  return formatDistanceToNowStrict(new Date(d), { addSuffix: true });
}

export function periodLabel(start: Date | string, end: Date | string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return format(e, "MMMM yyyy");
  }
  return `${format(s, "MMM d")} - ${format(e, "MMM d, yyyy")}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
