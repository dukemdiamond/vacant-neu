import { campusTime, isExamPeriod, isNoClassDate, type ScheduleArtifact } from "@vacantneu/core";

export type TermPhase =
  | { kind: "in-session" }
  | { kind: "before-term"; firstDay: string }
  | { kind: "after-term" }
  | { kind: "holiday" }
  | { kind: "exams" };

/**
 * Where today sits relative to the term.
 *
 * Without this the page is quietly misleading on the days that matter most. Before classes begin,
 * every room is technically free and the building list reads "71 of 71" all the way down, which
 * looks like a bug rather than a fact. Naming the phase turns that into information.
 */
export function termPhase(artifact: ScheduleArtifact, now: Date): TermPhase {
  const today = campusTime(now).date;

  if (isExamPeriod(artifact.calendar, today)) return { kind: "exams" };
  if (isNoClassDate(artifact.calendar, today)) return { kind: "holiday" };

  let first: string | null = null;
  let last: string | null = null;
  for (const meeting of artifact.meetings) {
    if (first === null || meeting.startDate < first) first = meeting.startDate;
    if (last === null || meeting.endDate > last) last = meeting.endDate;
  }

  if (first !== null && today < first) return { kind: "before-term", firstDay: first };
  if (last !== null && today > last) return { kind: "after-term" };
  return { kind: "in-session" };
}

/** "2026-09-09" -> "September 9", or "September 9, 2026" with `withYear`. */
export function formatDay(iso: string, withYear = false): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}
