/**
 * Shared period-resolution helper (design.md §7). ALL reporting code — dashboard,
 * detailed reports, and CSV/XLSX/PDF exports — MUST resolve period boundaries
 * through this module so figures stay identical across surfaces (R11.3, R11.4).
 *
 * Timezone strategy: all business-day boundaries are computed in the fixed IANA zone
 * `Asia/Tashkent` (UTC+5, no daylight saving since 2000), regardless of server or
 * client device timezone. We convert to/from UTC using a fixed +05:00 offset rather
 * than a full tz database lookup, which is correct for Uzbekistan and avoids a
 * timezone-database dependency; if Uzbekistan's offset ever changes, update
 * TASHKENT_OFFSET_HOURS here (single source of truth).
 */

export const TASHKENT_OFFSET_HOURS = 5;

export type PeriodPreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

export interface ResolvedPeriod {
  /** Inclusive start instant, UTC. */
  start: Date;
  /** Exclusive end instant, UTC. */
  end: Date;
  /** The equivalent immediately-preceding period, same length, for comparison (R11.2). */
  previous: { start: Date; end: Date };
}

/** Returns "now" expressed as Tashkent wall-clock components. */
function nowInTashkent(): { year: number; month: number; day: number } {
  const utcNow = new Date();
  const tashkentMs = utcNow.getTime() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000;
  const t = new Date(tashkentMs);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth(), day: t.getUTCDate() };
}

/** Converts a Tashkent-local midnight (year, month(0-11), day) to the equivalent UTC instant. */
function tashkentMidnightUtc(year: number, month: number, day: number): Date {
  // Tashkent midnight = UTC (midnight - 5h) on the same calendar day.
  return new Date(Date.UTC(year, month, day, -TASHKENT_OFFSET_HOURS, 0, 0, 0));
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfWeek(year: number, month: number, day: number): Date {
  // Uzbekistan week starts Monday. JS getUTCDay(): 0=Sun..6=Sat.
  const anchor = tashkentMidnightUtc(year, month, day);
  const weekday = new Date(anchor.getTime() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000).getUTCDay();
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  return addDaysUtc(anchor, -diffToMonday);
}

export function resolvePeriod(preset: PeriodPreset, customStart?: string, customEnd?: string): ResolvedPeriod {
  const { year, month, day } = nowInTashkent();

  switch (preset) {
    case "today": {
      const start = tashkentMidnightUtc(year, month, day);
      const end = addDaysUtc(start, 1);
      const prevStart = addDaysUtc(start, -1);
      return { start, end, previous: { start: prevStart, end: start } };
    }
    case "yesterday": {
      const todayStart = tashkentMidnightUtc(year, month, day);
      const start = addDaysUtc(todayStart, -1);
      const end = todayStart;
      return { start, end, previous: { start: addDaysUtc(start, -1), end: start } };
    }
    case "this_week": {
      const start = startOfWeek(year, month, day);
      const end = addDaysUtc(start, 7);
      return { start, end, previous: { start: addDaysUtc(start, -7), end: start } };
    }
    case "last_week": {
      const thisWeekStart = startOfWeek(year, month, day);
      const start = addDaysUtc(thisWeekStart, -7);
      const end = thisWeekStart;
      return { start, end, previous: { start: addDaysUtc(start, -7), end: start } };
    }
    case "this_month": {
      const start = tashkentMidnightUtc(year, month, 1);
      const end = tashkentMidnightUtc(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, 1);
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const prevStart = tashkentMidnightUtc(prevYear, prevMonth, 1);
      return { start, end, previous: { start: prevStart, end: start } };
    }
    case "last_month": {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const start = tashkentMidnightUtc(prevYear, prevMonth, 1);
      const end = tashkentMidnightUtc(year, month, 1);
      const prevPrevMonth = prevMonth === 0 ? 11 : prevMonth - 1;
      const prevPrevYear = prevMonth === 0 ? prevYear - 1 : prevYear;
      const prevStart = tashkentMidnightUtc(prevPrevYear, prevPrevMonth, 1);
      return { start, end, previous: { start: prevStart, end: start } };
    }
    case "custom": {
      if (!customStart || !customEnd) {
        throw new Error("customStart and customEnd are required for preset 'custom'");
      }
      const start = new Date(`${customStart}T00:00:00+05:00`);
      const end = addDaysUtc(new Date(`${customEnd}T00:00:00+05:00`), 1);
      const lengthMs = end.getTime() - start.getTime();
      return { start, end, previous: { start: new Date(start.getTime() - lengthMs), end: start } };
    }
    default: {
      throw new Error(`Unknown period preset: ${preset satisfies never}`);
    }
  }
}
