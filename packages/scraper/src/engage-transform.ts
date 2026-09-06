/**
 * Turns Engage event records into the same Meeting shape a class produces.
 *
 * Modelling an event as a Meeting means the vacancy engine needs no knowledge of clubs at all: a
 * one-off event is simply a meeting whose date range is a single day and whose day mask is that
 * day's weekday. Everything the engine already does, overlap merging, holiday handling, next-free
 * time, works on it unchanged.
 */
import { DAY_BITS, type CampusEvent, type Meeting } from "@vacantneu/core";
import { createMatcher, isNonLocation, isRedacted, type Matcher } from "./location.js";
import { decodeEntities } from "./transform.js";

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DAY_OF_WEEK = [
  DAY_BITS.Sun,
  DAY_BITS.Mon,
  DAY_BITS.Tue,
  DAY_BITS.Wed,
  DAY_BITS.Thu,
  DAY_BITS.Fri,
  DAY_BITS.Sat,
];

export interface ParsedDates {
  startDate: string;
  startMinutes: number;
  endDate: string;
  endMinutes: number;
}

/** Strips the markup Engage wraps its date string in, leaving `<p>` boundaries as separators. */
function textOf(html: string): string[] {
  return html
    .split(/<\/p>/i)
    .map((part) =>
      decodeEntities(part.replace(/<[^>]*>/g, ""))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** "Sep 16, 2026" -> "2026-09-16". */
function parseDay(text: string): string | null {
  const m = /([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(text);
  if (!m) return null;
  const month = MONTHS[m[1]!.toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

/** "6:30 PM" or "6 PM" -> minutes since midnight. */
function parseClock(text: string): number | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  if (hour > 12) return null;
  const minute = m[2] ? Number(m[2]) : 0;
  if (minute > 59) return null;
  const pm = m[3]!.toLowerCase() === "p";
  if (hour === 12) hour = 0;
  return (hour + (pm ? 12 : 0)) * 60 + minute;
}

/**
 * Parses Engage's `eventDates` HTML.
 *
 * Two shapes occur in the live feed:
 *   same day     `<p>Wed, Sep 16, 2026</p><p>6 PM - 7 PM</p>`
 *   spanning     `<p>Fri, Sep 11, 2026 8:00 PM - </p><p>Sat, Sep 12, 2026 12:00 AM</p>`
 * The second covers both overnight events and multi-day ones.
 */
export function parseEventDates(html: string): ParsedDates | null {
  const parts = textOf(html);
  if (parts.length === 0) return null;

  const firstDay = parseDay(parts[0]!);
  if (!firstDay) return null;

  const secondDay = parts[1] ? parseDay(parts[1]) : null;

  if (secondDay) {
    // Spanning: each paragraph carries its own date and a single time.
    const start = parseClock(parts[0]!);
    const end = parseClock(parts[1]!);
    if (start === null || end === null) return null;
    return { startDate: firstDay, startMinutes: start, endDate: secondDay, endMinutes: end };
  }

  // Same day: the date is in the first paragraph, the time range in the second.
  const range = parts.slice(1).join(" ");
  const clocks = [...range.matchAll(/\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?/gi)].map((m) =>
    parseClock(m[0]),
  );
  const [start, end] = clocks;
  if (start === undefined || start === null || end === undefined || end === null) return null;
  return { startDate: firstDay, startMinutes: start, endDate: firstDay, endMinutes: end };
}

/** Bitmask for the weekday of an ISO date. */
function dayBitOf(iso: string): number {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return DAY_OF_WEEK[day] ?? 0;
}

/** The next calendar day after an ISO date. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Expands a parsed event into one Meeting per calendar day it occupies.
 *
 * A meeting cannot straddle midnight, because the engine reasons in minutes within a single day,
 * so an event running 8 PM to 1 AM becomes two: one closing out the first day, one opening the
 * second. Multi-day events are capped rather than expanded indefinitely; a week-long "hub" that
 * occupies a room around the clock is almost always an Engage listing artefact rather than a real
 * continuous booking.
 */
const MAX_SPAN_DAYS = 3;

export function toMeetings(
  roomId: string,
  dates: ParsedDates,
  label: string,
  detail: string,
): Meeting[] {
  const base = { roomId, kind: "event" as const, label, detail };

  if (dates.startDate === dates.endDate) {
    if (dates.endMinutes <= dates.startMinutes) return [];
    return [
      {
        ...base,
        days: dayBitOf(dates.startDate),
        start: dates.startMinutes,
        end: dates.endMinutes,
        startDate: dates.startDate,
        endDate: dates.startDate,
      },
    ];
  }

  const out: Meeting[] = [];
  let day = dates.startDate;
  for (let i = 0; i < MAX_SPAN_DAYS && day <= dates.endDate; i++) {
    const first = day === dates.startDate;
    const last = day === dates.endDate;
    const start = first ? dates.startMinutes : 0;
    const end = last ? dates.endMinutes : MINUTES_PER_DAY;
    if (end > start) {
      out.push({ ...base, days: dayBitOf(day), start, end, startDate: day, endDate: day });
    }
    if (last) break;
    day = nextDay(day);
  }
  return out;
}

export interface EventTransformResult {
  meetings: Meeting[];
  /** Every event with a readable date, whether or not its venue resolved to a room. */
  events: CampusEvent[];
  stats: {
    events: number;
    redacted: number;
    noLocation: number;
    unmatchedVenue: number;
    unparsedDates: number;
    matched: number;
  };
  /** Venues that named a place we could not resolve, for tuning the alias table. */
  unmatchedSamples: string[];
}

export function transformEvents(
  events: Record<string, string | null>[],
  rooms: Iterable<string>,
  buildings: { code: string; name: string }[],
): EventTransformResult {
  const matcher: Matcher = createMatcher(rooms, buildings);
  const stats = {
    events: events.length,
    redacted: 0,
    noLocation: 0,
    unmatchedVenue: 0,
    unparsedDates: 0,
    matched: 0,
  };
  const unmatched = new Set<string>();
  const meetings: Meeting[] = [];
  const listed: CampusEvent[] = [];

  for (const event of events) {
    const location = (event.eventLocation ?? "").trim();
    const dates = parseEventDates(event.eventDates ?? "");
    const name = decodeEntities((event.eventName ?? "").trim()) || "Club event";
    const club = decodeEntities((event.clubName ?? "").trim());
    const redacted = isRedacted(location);
    const hit = redacted || isNonLocation(location) ? null : matcher.match(location);

    // The events listing keeps anything with a readable date. A venue we cannot resolve, or one
    // Engage will not disclose, still describes something happening on campus that day.
    if (dates) {
      const path = (event.eventUrl ?? "").trim();
      listed.push({
        id: String(event.eventId ?? `${name}-${dates.startDate}-${dates.startMinutes}`),
        name,
        club,
        location: redacted ? "Private location" : location,
        roomId: hit?.roomId ?? null,
        date: dates.startDate,
        start: dates.startMinutes,
        end: dates.endMinutes,
        spansDays: dates.startDate !== dates.endDate,
        category: decodeEntities((event.eventCategory ?? "").trim()) || null,
        url: path ? `https://engage.northeastern.edu${path}` : null,
      });
    }

    if (redacted) {
      stats.redacted++;
      continue;
    }
    if (isNonLocation(location)) {
      stats.noLocation++;
      continue;
    }
    if (!hit) {
      stats.unmatchedVenue++;
      if (unmatched.size < 40) unmatched.add(location);
      continue;
    }
    if (!dates) {
      stats.unparsedDates++;
      continue;
    }

    const expanded = toMeetings(hit.roomId, dates, name, club);
    if (expanded.length === 0) {
      stats.unparsedDates++;
      continue;
    }
    stats.matched++;
    meetings.push(...expanded);
  }

  listed.sort(
    (a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.name.localeCompare(b.name),
  );

  meetings.sort(
    (a, b) =>
      a.roomId.localeCompare(b.roomId) ||
      a.startDate.localeCompare(b.startDate) ||
      a.start - b.start ||
      a.label.localeCompare(b.label),
  );

  return { meetings, events: listed, stats, unmatchedSamples: [...unmatched].sort() };
}
