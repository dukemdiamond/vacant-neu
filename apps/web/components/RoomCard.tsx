"use client";

import {
  campusTime,
  formatDuration,
  formatMinutes,
  formatRange,
  meetingsOnDay,
  type AcademicCalendar,
  type Meeting,
  type Room,
  type RoomStatus,
} from "@vacantneu/core";

/** A class starting within this window makes the room not worth walking to. */
const CLOSING_SOON_MINUTES = 20;

interface Props {
  room: Room;
  status: RoomStatus;
  meetings: Meeting[];
  calendar: AcademicCalendar;
  now: Date;
  /** Renders the room's schedule for today underneath. Used for a single searched result. */
  expanded?: boolean;
  /**
   * Whether the heading repeats the building name. False where a group header already names it,
   * so a card reads "204" rather than "Behrakis Health Sciences Cntr 204" directly beneath a
   * heading that says exactly that.
   */
  showBuilding?: boolean;
}

/**
 * One room's live answer.
 *
 * Free and occupied are distinguished by surface weight rather than by a green/red pair: free
 * rooms sit raised on the page, occupied rooms recede into the sunken wash. Northeastern red is
 * held back for the one case that genuinely needs urgency, a room about to be reclaimed.
 * Status is never carried by colour alone; the label and the duration say it in words.
 */
export function RoomCard({
  room,
  status,
  meetings,
  calendar,
  now,
  expanded = false,
  showBuilding = true,
}: Props) {
  const free = status.state === "free";
  const closingSoon =
    free && status.minutesUntilChange !== null && status.minutesUntilChange <= CLOSING_SOON_MINUTES;

  return (
    <article
      className={[
        "rounded-[var(--radius-card)] border px-5 py-4 transition-colors duration-200",
        free ? "border-line bg-surface-raised" : "border-transparent bg-wash-faint",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className={["text-lg leading-tight", free ? "text-ink" : "text-ink-muted"].join(" ")}>
          {showBuilding ? room.displayName : room.room}
        </h3>
        <span
          className={[
            "shrink-0 text-sm",
            closingSoon ? "text-accent" : free ? "text-ink-body" : "text-ink-faint",
          ].join(" ")}
        >
          {free ? "Open" : "In use"}
        </span>
      </div>

      <p className="tabular mt-1.5 text-sm text-ink-muted">
        {free ? <FreeDetail status={status} /> : <BusyDetail status={status} />}
      </p>

      {expanded && (
        <DaySchedule meetings={meetings} status={status} calendar={calendar} now={now} />
      )}
    </article>
  );
}

function FreeDetail({ status }: { status: RoomStatus }) {
  if (status.minutesUntilChange === null) {
    return <>Nothing else scheduled today.</>;
  }
  return (
    <>
      Free for {formatDuration(status.minutesUntilChange)}, until{" "}
      {formatMinutes(status.next!.start)}. Then {status.next!.course}.
    </>
  );
}

function BusyDetail({ status }: { status: RoomStatus }) {
  const { current, minutesUntilChange } = status;
  if (!current) return <>In use.</>;
  return (
    <>
      {current.course} until {formatMinutes(current.end)}
      {minutesUntilChange !== null && <>, {formatDuration(minutesUntilChange)} left</>}.
    </>
  );
}

/**
 * The room's classes for today only.
 *
 * This reuses the same day filter the vacancy engine uses, so the list can never disagree with
 * the status line above it: a holiday or an out-of-range date empties both at once.
 */
function DaySchedule({
  meetings,
  status,
  calendar,
  now,
}: {
  meetings: Meeting[];
  status: RoomStatus;
  calendar: AcademicCalendar;
  now: Date;
}) {
  const today = meetingsOnDay(meetings, calendar, campusTime(now)).sort(
    (a, b) => a.start - b.start,
  );

  if (today.length === 0) {
    return (
      <p className="mt-5 border-t border-line pt-4 text-sm text-ink-faint">
        No classes are scheduled in this room today.
      </p>
    );
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      <h4 className="text-xs uppercase tracking-wide text-ink-faint">Today in this room</h4>
      <ul className="mt-3 flex flex-col gap-2">
        {today.map((m, i) => {
          const active =
            status.current !== null &&
            status.current.course === m.course &&
            status.current.start === m.start;
          return (
            <li key={`${m.course}-${m.start}-${i}`} className="flex items-baseline gap-3 text-sm">
              <span
                className={[
                  "tabular w-40 shrink-0 whitespace-nowrap",
                  active ? "text-ink" : "text-ink-faint",
                ].join(" ")}
              >
                {formatRange(m.start, m.end)}
              </span>
              <span className={active ? "text-ink" : "text-ink-muted"}>
                {m.course} <span className="text-ink-faint">{m.title}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
