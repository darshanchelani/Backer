import { addDays, startOfMonth, startOfWeek } from "date-fns";
import type { Cadence } from "@prisma/client";

export function cadenceIntervalDays(cadence: Cadence): number {
  return cadence === "WEEKLY" ? 7 : cadence === "BIWEEKLY" ? 14 : 30;
}

export function cadenceLabel(cadence: Cadence): string {
  return cadence === "WEEKLY" ? "weekly" : cadence === "BIWEEKLY" ? "every two weeks" : "monthly";
}

/** Next occurrence of a day-of-month (1-28) strictly after `from`. */
function nextMonthDay(from: Date, day: number): Date {
  let candidate = new Date(from.getFullYear(), from.getMonth(), day);
  if (candidate <= from) {
    candidate = new Date(from.getFullYear(), from.getMonth() + 1, day);
  }
  return candidate;
}

/** Next occurrence of a weekday (0-6) strictly after `from`. */
function nextWeekday(from: Date, weekday: number): Date {
  const delta = ((weekday - from.getDay() + 7) % 7) || 7;
  return addDays(from, delta);
}

/**
 * When the next update is due, based on the company's cadence:
 * anchor day if set, otherwise last send + interval.
 * Never-sent companies are nudged two weeks after signing up.
 */
export function computeNextDue(opts: {
  cadence: Cadence;
  anchorDay: number | null;
  lastSentAt: Date | null;
  companyCreatedAt: Date;
}): Date {
  if (!opts.lastSentAt) return addDays(opts.companyCreatedAt, 14);
  const base = opts.lastSentAt;

  if (opts.cadence === "MONTHLY") {
    if (opts.anchorDay) return nextMonthDay(base, Math.min(opts.anchorDay, 28));
    return addDays(base, 30);
  }

  const interval = opts.cadence === "WEEKLY" ? 7 : 14;
  if (opts.anchorDay != null) return nextWeekday(base, opts.anchorDay);
  return addDays(base, interval);
}

/** Uniqueness window for reminders: one nudge per week or per month. */
export function reminderWindowStart(cadence: Cadence, now: Date): Date {
  return cadence === "MONTHLY" ? startOfMonth(now) : startOfWeek(now, { weekStartsOn: 1 });
}
