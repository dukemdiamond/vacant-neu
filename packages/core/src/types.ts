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

export interface Building {
  /** Banner building code, e.g. "DG". */
  code: string;
  /** Banner's `buildingDescription`, e.g. "Dodge Hall". */
  name: string;
  roomCount: number;
}

export interface Room {
  /** Stable synthetic key, `${building}-${room}`, e.g. "DG-070". */
  id: string;
  /** Building code this room belongs to. */
  building: string;
  /** Room number as Banner reports it, e.g. "070". */
  room: string;
  /** Human label used in search and UI, e.g. "Dodge Hall 070". */
  displayName: string;
}

export interface Meeting {
  roomId: string;
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
  /** e.g. "CS2500". */
  course: string;
  title: string;
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
  campus: string;
  buildings: Building[];
  rooms: Room[];
  meetings: Meeting[];
  calendar: AcademicCalendar;
}
