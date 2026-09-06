/**
 * Data model for the vacantNEU schedule artifact.
 *
 * Deliberately shaped like normalized DB tables (buildings / rooms / meetings) even though it
 * ships as a static JSON file. If we ever outgrow the static artifact, loading this into Postgres
 * is a `INSERT ... SELECT` over these arrays rather than a remodelling exercise.
 */

/** Bit positions used by {@link Meeting.days}. Monday is bit 0 through Sunday at bit 6. */
export const DAY_BITS = { Mon: 1, Tue: 2, Wed: 4, Thu: 8, Fri: 16, Sat: 32, Sun: 64 } as const;

/** All NEU scheduling happens in campus-local time, never the visitor's timezone. */
export const CAMPUS_TZ = "America/New_York";

export interface Term {
  /** Banner term code, e.g. "202710". */
  code: string;
  /** Banner's human label, e.g. "Fall 2026 Semester". */
  description: string;
}

/** A Northeastern location with timetabled rooms. */
export interface Campus {
  /** Banner campus code, e.g. "BOS". */
  code: string;
  /** Banner's `campusDescription`, e.g. "Boston". */
  name: string;
  buildingCount: number;
  roomCount: number;
}

export interface Building {
  /** Banner building code, e.g. "DG". */
  code: string;
  /** Banner's `buildingDescription`, e.g. "Dodge Hall". */
  name: string;
  /** Campus code this building belongs to. */
  campus: string;
  roomCount: number;
}

export interface Room {
  /**
   * Stable synthetic key, `${building}-${room}`, e.g. "DG-070".
   *
   * Campus is not part of the key because Banner's building codes are unique across every
   * campus. The scraper asserts that on each run rather than trusting it to stay true.
   */
  id: string;
  /** Campus code this room belongs to. */
  campus: string;
  /** Building code this room belongs to. */
  building: string;
  /** Room number as Banner reports it, e.g. "070". */
  room: string;
  /** Human label used in search and UI, e.g. "Dodge Hall 070". */
  displayName: string;
}

/**
 * Where a booking came from.
 *
 * A room is occupied if anything is in it, so classes and club events are the same shape to the
 * vacancy engine. They are told apart only for display, and so that a failure to reach one source
 * can never be mistaken for the room being free.
 */
export type BookingKind = "class" | "event";

export interface Meeting {
  roomId: string;
  kind: BookingKind;
  /** Bitmask of {@link DAY_BITS}. */
  days: number;
  /** Minutes since campus-local midnight, inclusive. */
  start: number;
  /** Minutes since campus-local midnight, exclusive. */
  end: number;
  /** ISO `YYYY-MM-DD`, inclusive. */
  startDate: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  endDate: string;
  /** Shown first: a course code for a class, the event name for a club event. */
  label: string;
  /** Shown after, dimmed: the course title for a class, the hosting club for an event. */
  detail: string;
}

/** Dates on which the regular class schedule does not run. */
export interface AcademicCalendar {
  /** ISO dates with no classes at all (holidays, breaks). */
  noClassDates: string[];
  /** Inclusive ISO ranges where a separate exam schedule replaces the regular one. */
  examPeriods: { start: string; end: string; label: string }[];
}

export interface ScheduleArtifact {
  term: Term;
  /** ISO timestamp of the scrape that produced this artifact. */
  generatedAt: string;
  /** Every campus with timetabled rooms, largest first. */
  campuses: Campus[];
  buildings: Building[];
  rooms: Room[];
  meetings: Meeting[];
  calendar: AcademicCalendar;
}
