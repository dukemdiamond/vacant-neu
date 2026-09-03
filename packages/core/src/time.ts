import { CAMPUS_TZ } from "./types.js";

/**
 * Campus-local wall clock for an instant.
 *
 * Everything in this app reasons in Northeastern's timezone, not the visitor's. A student checking
 * from a laptop still set to PT must see the same answer as the student standing in the hallway,
 * and DST transitions have to come from the tz database rather than a fixed UTC offset.
 */
export interface CampusTime {
  /** ISO `YYYY-MM-DD` in campus time. */
  date: string;
  /** Minutes since campus-local midnight. */
  minutes: number;
  /** Bit from `DAY_BITS` for this weekday. */
  dayBit: number;
}

const FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAY_BIT: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 4,
  Thu: 8,
  Fri: 16,
  Sat: 32,
  Sun: 64,
};

export function campusTime(instant: Date): CampusTime {
  const parts: Record<string, string> = {};
  for (const p of FORMATTER.formatToParts(instant)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dayBit: WEEKDAY_BIT[parts.weekday ?? ""] ?? 0,
  };
}

/** Formats minutes-since-midnight as a 12-hour label, e.g. 545 -> "9:05 AM". */
export function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Formats a duration in minutes as a compact human label, e.g. 135 -> "2h 15m". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
