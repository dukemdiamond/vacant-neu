/**
 * Never trade a good events artifact for a worse one.
 *
 * An anonymous Engage pull still succeeds; it just finds far less, because Engage redacts the
 * venues. Letting it overwrite an authenticated artifact would quietly discard real bookings and
 * look like a normal run. Same reasoning as the class scraper's count floors: keeping yesterday's
 * data beats publishing a hollow version of today's.
 *
 * "Better" has to be measured in bookings that are still ahead. Events are dated, so an artifact
 * decays on its own: one authenticated pull left in place for two months is mostly history, and
 * comparing its full booking count against a fresh pull would keep it in place forever.
 */
import type { Meeting } from "@vacantneu/core";

/** Below this many upcoming bookings, a drop is noise rather than a collapse. */
const COLLAPSE_FLOOR = 4;

export interface EventsSnapshot {
  authenticated: boolean;
  meetings: Pick<Meeting, "endDate">[];
}

/** Bookings that have not finished by `today` (ISO, campus-local). */
export function upcoming(meetings: Pick<Meeting, "endDate">[], today: string): number {
  return meetings.filter((m) => m.endDate >= today).length;
}

/** Why `next` must not replace `previous`, or null when it may. */
export function refuseOverwrite(
  previous: EventsSnapshot,
  next: EventsSnapshot,
  today: string,
): string | null {
  const before = upcoming(previous.meetings, today);
  const after = upcoming(next.meetings, today);

  if (previous.authenticated && !next.authenticated && after < before) {
    return (
      `this anonymous pull has ${after} upcoming bookings against ${before} in the existing ` +
      `authenticated one`
    );
  }
  if (before > COLLAPSE_FLOOR && after < before / 2) {
    return `upcoming bookings would drop from ${before} to ${after}`;
  }
  return null;
}
