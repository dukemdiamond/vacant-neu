import type { AcademicCalendar } from "./types.js";

/**
 * HAND-MAINTAINED. Review every academic year.
 *
 * Banner's meeting rows carry a date range and day-of-week flags but know nothing about holidays:
 * a Mon/Wed class dated 09/09-12/20 will happily claim its room is occupied on Thanksgiving.
 * This is the one input to the pipeline that cannot be scraped.
 *
 * Transcribed verbatim from the registrar's University-Wide Academic Calendar (2026-2027):
 * https://registrar.northeastern.edu/wp-content/uploads/sites/9/2026-2027-Academic-Calendar.pdf
 *
 * Canada-only observances (Vancouver campus) are intentionally excluded; v1 is Boston-only.
 */

/** Expands an inclusive ISO date range into individual ISO dates. */
function range(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export const ACADEMIC_CALENDAR_2026_2027: AcademicCalendar = {
  noClassDates: [
    // --- Fall 2026 ---
    "2026-09-07", // Labor Day
    "2026-10-12", // Indigenous Peoples Day
    "2026-11-11", // Veterans Day
    // Fall break: first day Nov 25, classes resume Nov 30.
    ...range("2026-11-25", "2026-11-29"),

    // --- Spring 2027 ---
    "2027-01-18", // Martin Luther King Jr. Day
    "2027-02-15", // Presidents Day
    // Spring break: first day Mar 8, classes resume Mar 15.
    ...range("2027-03-08", "2027-03-14"),
    "2027-03-26", // Good Friday
    "2027-03-31", // Farmworkers Day
    "2027-04-19", // Patriots Day

    // --- Summer 2027 ---
    "2027-05-31", // Memorial Day
    "2027-06-18", // Juneteenth (observed)
    "2027-06-19", // Juneteenth
    "2027-07-04", // Independence Day
    "2027-07-05", // Independence Day (observed)
  ],
  examPeriods: [
    // During finals, rooms follow an exam schedule that Banner's class-search endpoint does not
    // expose. We surface a warning rather than assert vacancy we cannot actually verify.
    { start: "2026-12-14", end: "2026-12-20", label: "Fall 2026 final exams" },
    { start: "2027-04-26", end: "2027-05-02", label: "Spring 2027 final exams" },
    { start: "2027-08-16", end: "2027-08-22", label: "Summer 2027 final exams" },
  ],
};
