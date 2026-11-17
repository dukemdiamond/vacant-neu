/**
 * Decides which Banner term is "current".
 *
 * Banner lists terms newest first and keeps several open at once: the semester in progress, and
 * from about November (or April) the next one, which is open for registration but mostly has no
 * rooms assigned yet. Picking the newest open term therefore jumps to next semester weeks before
 * it starts, and publishes a schedule that says nearly every room is free. Banner's
 * "(View Only)" marker cannot settle it either: it flips on an administrative schedule, not when
 * classes end.
 *
 * Dates can settle it, and Banner already has them: every meeting row carries a start and end
 * date. A sample page per candidate term is enough to read each term's span, so the decision
 * needs no hand-maintained term calendar that would silently go stale next year.
 */
import { parseBannerDate } from "./transform.js";
import type { BannerSection } from "./schema.js";

/**
 * How early to switch to the next term. The scrape needs to be serving the new term on its first
 * day, but room assignments are still settling in the weeks before, and a term switched to too
 * early fails the plausibility floors. A term in session always wins regardless, so this never
 * cuts the previous term's finals short.
 */
export const LEAD_DAYS = 7;

/** Share of meeting rows that must have ended for the term to count as over. */
const END_QUANTILE = 0.9;

export interface TermSpan {
  /** ISO date most of the term's meetings start on: the first day of classes. */
  start: string;
  /** ISO date by which nearly every meeting has ended, finals included. */
  end: string;
}

export interface TermCandidate {
  code: string;
  description: string;
  span: TermSpan | null;
}

/**
 * The full-term semesters the app serves.
 *
 * CPS quarters and the Law calendar overlap the main semesters and cover a sliver of the rooms,
 * so they are never the right schedule to publish on their own.
 */
export function isMainSemester(description: string): boolean {
  return /\bsemester\b/i.test(description) && !/\b(law|cps)\b/i.test(description);
}

/**
 * Reads a term's span from its meeting rows.
 *
 * The start is the most common start date rather than the earliest, because a few sections
 * (intensives, late starts) begin off-calendar. The end is a high quantile rather than the
 * latest, because a single row running past the term would otherwise keep it "current" for
 * months. Returns null when no row carries a usable date.
 */
export function termSpan(sections: BannerSection[]): TermSpan | null {
  const starts = new Map<string, number>();
  const ends: string[] = [];

  for (const section of sections) {
    for (const entry of section.meetingsFaculty ?? []) {
      const mt = entry.meetingTime;
      if (!mt) continue;
      const start = parseBannerDate(mt.startDate);
      const end = parseBannerDate(mt.endDate);
      if (!start || !end) continue;
      starts.set(start, (starts.get(start) ?? 0) + 1);
      ends.push(end);
    }
  }
  if (ends.length === 0) return null;

  // Ties go to the earlier date, so the result does not depend on Banner's row order.
  const start = [...starts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  ends.sort();
  const end = ends[Math.min(ends.length - 1, Math.floor(ends.length * END_QUANTILE))]!;
  return { start, end };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface TermChoice {
  term: TermCandidate;
  reason: string;
}

/**
 * Picks the term to publish for a campus-local date, in order of preference:
 *
 * 1. The term in session, finals included.
 * 2. A term starting within {@link LEAD_DAYS}, so its schedule is live on the first day.
 * 3. Between terms, the one that most recently ended. No classes meet during a break, so its
 *    schedule correctly shows rooms free, and the next term is not settled yet.
 * 4. Failing all of those (nothing has started), the earliest upcoming term.
 *
 * Returns null only when no candidate has a readable span.
 */
export function chooseTerm(candidates: TermCandidate[], today: string): TermChoice | null {
  const dated = candidates.filter((c): c is TermCandidate & { span: TermSpan } => !!c.span);
  if (dated.length === 0) return null;

  const byStart = [...dated].sort((a, b) => a.span.start.localeCompare(b.span.start));
  const horizon = addDays(today, LEAD_DAYS);

  // The latest-starting term already under way. Terms that overlap (Summer 1 inside Summer
  // Full, say) resolve to the more recent one.
  const inSession = byStart.filter((c) => c.span.start <= today && today <= c.span.end).at(-1);
  if (inSession) {
    return {
      term: inSession,
      reason: `in session ${inSession.span.start} to ${inSession.span.end}`,
    };
  }

  const imminent = byStart.find((c) => c.span.start > today && c.span.start <= horizon);
  if (imminent) {
    return { term: imminent, reason: `classes start ${imminent.span.start}` };
  }

  const ended = byStart.filter((c) => c.span.end < today).at(-1);
  if (ended) {
    return { term: ended, reason: `between terms; ${ended.span.end} was the last day` };
  }

  const upcoming = byStart[0]!;
  return { term: upcoming, reason: `nothing in session; next term starts ${upcoming.span.start}` };
}
