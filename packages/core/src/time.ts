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

/**
 * Formats a start and end time as one label, e.g. 555 and 620 -> "9:15 to 10:20 AM".
 *
 * The meridiem is printed once when both ends share it, which keeps schedule rows narrow enough
 * to sit in a fixed column without wrapping.
 */
export function formatRange(start: number, end: number): string {
  const sameMeridiem = Math.floor(start / 60) % 24 < 12 === Math.floor(end / 60) % 24 < 12;
  const from = sameMeridiem ? formatMinutes(start).replace(/ [AP]M$/, "") : formatMinutes(start);
  return `${from} to ${formatMinutes(end)}`;
}

/**
 * The instant at which the campus wall clock reads the given date and time.
 *
 * A date input yields "2026-09-16" and a time input yields "10:30", and the person choosing them
 * means half past ten on campus. Naively parsing that pair produces an instant in the visitor's
 * own timezone, so a student checking from Seattle would silently be shown the 7:30 AM schedule.
 *
 * Rather than hard-code an offset, this converges on the answer: guess, read the campus clock at
 * that guess, and shift by the error. Two passes are enough even when the guess and the answer
 * fall on opposite sides of a daylight saving transition.
 *
 * Returns null for malformed input. The hour repeated by the autumn transition is ambiguous by
 * definition; this resolves it to one of the two, which is immaterial at a class's granularity.
 */
export function campusInstant(dateISO: string, timeHHMM: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !/^\d{2}:\d{2}$/.test(timeHHMM)) return null;

  const target = Date.parse(`${dateISO}T${timeHHMM}:00Z`);
  if (Number.isNaN(target)) return null;

  let guess = target;
  for (let pass = 0; pass < 2; pass++) {
    const wall = campusTime(new Date(guess));
    const hh = String(Math.floor(wall.minutes / 60)).padStart(2, "0");
    const mm = String(wall.minutes % 60).padStart(2, "0");
    const reached = Date.parse(`${wall.date}T${hh}:${mm}:00Z`);
    if (reached === target) break;
    guess += target - reached;
  }
  return new Date(guess);
}

/** Campus-local date as `YYYY-MM-DD`, for prefilling a date input. */
export function campusDateISO(instant: Date): string {
  return campusTime(instant).date;
}

/** Campus-local time as `HH:MM`, for prefilling a time input. */
export function campusTimeHHMM(instant: Date): string {
  const { minutes } = campusTime(instant);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
