import type { AcademicCalendar, Meeting, ScheduleArtifact } from "./types.js";
import { campusTime, type CampusTime } from "./time.js";

/**
 * The vacancy engine.
 *
 * vacantNEU is the inverse of a course catalog: a room is free exactly when no scheduled meeting
 * covers the current instant. Everything here is pure and dependency-free so the scraper, the
 * tests, and all three UI surfaces share one definition of "free" — if the map and the browse
 * page ever disagree about a room, that's a UI bug, not a data question.
 */

export type RoomState = "free" | "occupied";

export interface RoomStatus {
  roomId: string;
  state: RoomState;
  /** The meeting currently occupying the room, when `state` is "occupied". */
  current: Meeting | null;
  /**
   * Minutes until the state flips, or `null` if it will not change again today.
   * When free this counts down to the next class; when occupied, to the moment the room empties.
   */
  minutesUntilChange: number | null;
  /** The next meeting in this room today, if any. */
  next: Meeting | null;
  /** True during a period where the regular class schedule does not apply (exams, breaks). */
  scheduleUnreliable: boolean;
}

/** An inclusive-start, exclusive-end busy interval in minutes since campus-local midnight. */
interface Interval {
  start: number;
  end: number;
  meeting: Meeting;
}

function withinDateRange(meeting: Meeting, date: string): boolean {
  // ISO YYYY-MM-DD sorts lexicographically, so string comparison is correct here.
  return meeting.startDate <= date && date <= meeting.endDate;
}

/** True when the regular schedule is suspended entirely (holiday or break). */
export function isNoClassDate(calendar: AcademicCalendar, date: string): boolean {
  return calendar.noClassDates.includes(date);
}

/** True during a final-exam period, when rooms follow a separate schedule Banner doesn't expose. */
export function isExamPeriod(calendar: AcademicCalendar, date: string): boolean {
  return calendar.examPeriods.some((p) => p.start <= date && date <= p.end);
}

/** Meetings that actually convene in a given room on a given campus-local day. */
export function meetingsOnDay(
  meetings: readonly Meeting[],
  calendar: AcademicCalendar,
  now: CampusTime,
): Meeting[] {
  if (isNoClassDate(calendar, now.date)) return [];
  return meetings.filter((m) => (m.days & now.dayBit) !== 0 && withinDateRange(m, now.date));
}

/**
 * Merges overlapping and exactly-adjacent meetings into contiguous busy blocks.
 *
 * Only truly touching intervals merge (gap <= 0). A 10-minute passing period between two classes
 * is reported honestly as 10 free minutes; deciding that such a gap is too short to be useful is
 * a UI concern, handled by the "free for at least N minutes" filter, not a data concern.
 */
function busyBlocks(dayMeetings: Meeting[]): Interval[] {
  const sorted = [...dayMeetings].sort((a, b) => a.start - b.start);
  const blocks: Interval[] = [];
  for (const m of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && m.start <= last.end) {
      if (m.end > last.end) last.end = m.end;
    } else {
      blocks.push({ start: m.start, end: m.end, meeting: m });
    }
  }
  return blocks;
}

/** Computes a room's free/occupied status at an instant. */
export function roomStatus(
  roomId: string,
  meetings: readonly Meeting[],
  instant: Date,
  calendar: AcademicCalendar,
): RoomStatus {
  const now = campusTime(instant);
  const today = meetingsOnDay(meetings, calendar, now);
  const blocks = busyBlocks(today);

  const scheduleUnreliable = isExamPeriod(calendar, now.date);
  const active = blocks.find((b) => b.start <= now.minutes && now.minutes < b.end) ?? null;
  const upcoming = blocks.find((b) => b.start > now.minutes) ?? null;

  if (active) {
    // The occupying meeting is whichever of today's classes actually covers this instant; the
    // block may have absorbed several back-to-back classes.
    const current =
      today.find((m) => m.start <= now.minutes && now.minutes < m.end) ?? active.meeting;
    return {
      roomId,
      state: "occupied",
      current,
      minutesUntilChange: active.end - now.minutes,
      next: upcoming?.meeting ?? null,
      scheduleUnreliable,
    };
  }

  return {
    roomId,
    state: "free",
    current: null,
    minutesUntilChange: upcoming ? upcoming.start - now.minutes : null,
    next: upcoming?.meeting ?? null,
    scheduleUnreliable,
  };
}

/** Groups meetings by room once so status for many rooms doesn't rescan the full meeting list. */
export function indexMeetingsByRoom(meetings: readonly Meeting[]): Map<string, Meeting[]> {
  const index = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const list = index.get(m.roomId);
    if (list) list.push(m);
    else index.set(m.roomId, [m]);
  }
  return index;
}

/** Status for every room in the artifact, ordered as the artifact lists them. */
export function allRoomStatuses(artifact: ScheduleArtifact, instant: Date): RoomStatus[] {
  const index = indexMeetingsByRoom(artifact.meetings);
  return artifact.rooms.map((room) =>
    roomStatus(room.id, index.get(room.id) ?? [], instant, artifact.calendar),
  );
}

/**
 * Whether a room is free now and stays free for at least `minMinutes`.
 * This is what powers "I need somewhere to work for the next hour".
 */
export function isFreeFor(status: RoomStatus, minMinutes: number): boolean {
  if (status.state !== "free") return false;
  return status.minutesUntilChange === null || status.minutesUntilChange >= minMinutes;
}
